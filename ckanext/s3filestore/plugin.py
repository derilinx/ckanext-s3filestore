# encoding: utf-8
import ckan.plugins as plugins
import ckantoolkit as toolkit

import ckanext.s3filestore.uploader
from ckanext.s3filestore.views import resource, uploads
from ckanext.s3filestore.click_commands import upload_resources, upload_assets, fix_cors


class S3FileStorePlugin(plugins.SingletonPlugin):
    plugins.implements(plugins.IConfigurer)
    plugins.implements(plugins.IConfigurable)
    plugins.implements(plugins.IUploader)
    plugins.implements(plugins.IBlueprint)
    plugins.implements(plugins.IClick)
    plugins.implements(plugins.ITemplateHelpers)
    plugins.implements(plugins.IActions)

    # IConfigurer

    def update_config(self, config_):
        toolkit.add_template_directory(config_, 'templates')
        # We need to register the following templates dir in order
        # to fix downloading the HTML file instead of previewing when
        # 'webpage_view' is enabled
        toolkit.add_template_directory(config_, 'theme/templates')
        toolkit.add_public_directory(config_, 'public')
        toolkit.add_resource('public', 's3filestore')

    # IConfigurable

    def configure(self, config):
        # Certain config options must exists for the plugin to work. Raise an
        # exception if they're missing.
        missing_config = "{0} is not configured. Please amend your .ini file."
        config_options = (
            'ckanext.s3filestore.aws_bucket_name',
            'ckanext.s3filestore.region_name',
            'ckanext.s3filestore.signature_version'
        )

        if not config.get('ckanext.s3filestore.aws_use_ami_role'):
            config_options += ('ckanext.s3filestore.aws_access_key_id',
                               'ckanext.s3filestore.aws_secret_access_key')

        for option in config_options:
            if not config.get(option, None):
                raise RuntimeError(missing_config.format(option))

        # Check that options actually work, if not exceptions will be raised
        if toolkit.asbool(
                config.get('ckanext.s3filestore.check_access_on_startup',
                           True)):
            ckanext.s3filestore.uploader.BaseS3Uploader().get_s3_bucket(
                config.get('ckanext.s3filestore.aws_bucket_name'))

    # IUploader

    def get_resource_uploader(self, data_dict):
        '''Return an uploader object used to upload resource files.'''
        return ckanext.s3filestore.uploader.S3ResourceUploader(data_dict)

    def get_uploader(self, upload_to, old_filename=None):
        '''Return an uploader object used to upload general files.'''
        return ckanext.s3filestore.uploader.S3Uploader(upload_to,
                                                       old_filename)

    # IBlueprint

    def get_blueprint(self):
        blueprints = resource.get_blueprints() +\
                     uploads.get_blueprints()
        return blueprints

    # IClick

    def get_commands(self):
        return [upload_resources, upload_assets, fix_cors]

    # ITemplateHelpers
    def get_helpers(self):
        config = toolkit.config
        bucket = config.get('ckanext.s3filestore.aws_bucket_name', None)
        if config.get('ckanext.s3filestore.aws_storage_path', None):
            bucket = bucket + '/' + config.get('ckanext.s3filestore.aws_storage_path')

        return {'s3filestore_get_bucket': bucket,
                's3filestore_get_aws_key': config.get('ckanext.s3filestore.aws_access_key_id', None),
                's3filestore_get_host_url': config.get('ckanext.s3filestore.host_name', None),
                's3filestore_get_region': config.get('ckanext.s3filestore.region_name', None)
                }


    # IActions
    def get_actions(self):
        return { 's3filestore_go_metadata': go_metadata }

        
def go_metadata(context, data_dict):
    package_id = data_dict['id']
    
    toolkit.check_access('package_update', context, data_dict)
    context = dict(context, allow_state_change=True)
    return toolkit.get_action('package_patch')(context, {'id': package_id,
                                                         'state': 'active'})
        