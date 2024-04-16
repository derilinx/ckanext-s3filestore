
import os
import click

from sqlalchemy import create_engine
from sqlalchemy.sql import text
from ckantoolkit import config
from ckanext.s3filestore.uploader import BaseS3Uploader
from botocore.exceptions import ClientError

storage_path = config.get('ckan.storage_path',
                          '/var/lib/ckan/default/resources')
sqlalchemy_url = config.get('sqlalchemy.url',
                            'postgresql://user:pass@localhost/db')
bucket_name = config.get('ckanext.s3filestore.aws_bucket_name')
folder = config.get('ckanext.s3filestore.aws_storage_path', '')
acl = config.get('ckanext.s3filestore.acl', 'public-read')


@click.command(u's3-upload',
               short_help=u'Uploads all resources '
                          u'from "ckan.storage_path"'
                          u' to the configured s3 bucket')
def upload_resources():
    resource_ids_and_paths = {}

    for root, dirs, files in os.walk(storage_path):
        if files:
            resource_id = root.split('/')[-2] + root.split('/')[-1] + files[0]
            resource_ids_and_paths[resource_id] = os.path.join(root, files[0])

    click.secho(
        'Found {0} resource files in '
        'the file system'.format(len(resource_ids_and_paths.keys())),
        fg=u'green',
        bold=True)

    engine = create_engine(sqlalchemy_url)
    connection = engine.connect()

    resource_ids_and_names = {}

    try:
        for resource_id, file_path in resource_ids_and_paths.items():
            resource = connection.execute(text('''
                   SELECT id, url, url_type
                   FROM resource
                   WHERE id = :id
               '''), id=resource_id)
            if resource.rowcount:
                _id, url, _type = resource.first()
                if _type == 'upload' and url:
                    file_name = url.split('/')[-1] if '/' in url else url
                    resource_ids_and_names[_id] = file_name.lower()
    finally:
        connection.close()
        engine.dispose()

    click.secho('{0} resources matched on the database'.format(
        len(resource_ids_and_names.keys())),
        fg=u'green',
        bold=True)

    uploader = BaseS3Uploader()
    s3_connection = uploader.get_s3_resource()

    uploaded_resources = []
    for resource_id, file_name in resource_ids_and_names.items():
        if folder:
            key = '{folder}/resources/{resource_id}/{file_name}'.format(
                folder=folder,resource_id=resource_id, file_name=file_name)
        else:
            key = 'resources/{resource_id}/{file_name}'.format(
                resource_id=resource_id, file_name=file_name)
        s3_connection.Object(bucket_name, key)\
            .put(Body=open(resource_ids_and_paths[resource_id],
                           u'rb'),
                 ACL=acl)
        uploaded_resources.append(resource_id)
        click.secho(
            'Uploaded resource {0} ({1}) to S3'.format(resource_id,
                                                       file_name),
            fg=u'green',
            bold=True)

    click.secho(
        'Done, uploaded {0} resources to S3'.format(
            len(uploaded_resources)),
        fg=u'green',
        bold=True)


@click.command(u's3-assets',
               short_help=u'Uploads all group assets '
                          u'from "ckan.storage_path"'
                          u' to the configured s3 bucket')
def upload_assets():
    group_ids_and_paths = {}
    for root, dirs, files in os.walk(storage_path):
        if root[-5:] == 'group':
            for idx, group_file in enumerate(files):
                group_ids_and_paths[group_file] = os.path.join(
                    root, files[idx])
    click.secho('Found {0} resource files in the file system'.format(
        len(group_ids_and_paths)),
        fg=u'green',
        bold=True)

    click.secho('{0} group assets found in the database'.format(
        len(group_ids_and_paths.keys())),
        fg=u'green',
        bold=True)

    uploader = BaseS3Uploader()
    s3_connection = uploader.get_s3_resource()

    uploaded_resources = []
    for resource_id, file_name in group_ids_and_paths.items():
        key = 'storage/uploads/group/{resource_id}'.format(
            resource_id=resource_id)
        s3_connection.Object(bucket_name, key).put(
            Body=open(file_name, u'rb'), ACL=acl)
        uploaded_resources.append(resource_id)
        click.secho(
            'Uploaded resource {0} to S3'.format(file_name),
            fg=u'green', bold=True)
    click.secho('Done, uploaded {0} resources to S3'.format(
        len(uploaded_resources)),
        fg=u'green', bold=True)

@click.command(u's3-fix-cors',
               short_help=u'Fixes CORS for the '
                          u'configured s3 bucket')
def fix_cors():
    site_url = config.get('ckan.site_url')
    if site_url.startswith('https://'):
        origins = ['https://'+site_url[8:], 'http://'+site_url[8:]]
    elif site_url.startswith('http://'):
        origins = ['https://'+site_url[7:], 'http://'+site_url[7:]]

    cors_configuration = {
        'CORSRules': [{
            'AllowedHeaders': ['*'],
            'AllowedMethods': ['GET', 'PUT', 'POST', 'DELETE'],
            'AllowedOrigins': origins,
            'ExposeHeaders': ['ETag']
        }]
    }

    uploader = BaseS3Uploader()
    s3_client = uploader.get_s3_client()

    def get_bucket_cors():
        try:
            response = s3_client.get_bucket_cors(Bucket=bucket_name)
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchCORSConfiguration':
                print("No CORS configuration on bucket %s" % bucket_name)
            else:
                # AllAccessDisabled error == bucket not found
                print(e)

        return response['CORSRules']
    print("Current CORS Rules: %r" % get_bucket_cors())

    s3_client.put_bucket_cors(Bucket=bucket_name,
                              CORSConfiguration=cors_configuration)
    

    print("Updated CORS Rules: %r" % get_bucket_cors())
