# encoding: utf-8
import os
import logging

import flask
from botocore.exceptions import ClientError

import ckantoolkit as toolkit
from ckantoolkit import _, request
import ckan.lib.base as base

from hashlib import sha256
import datetime
import hashlib
import hmac
from ckantoolkit import config as ckan_config

from ckanext.s3filestore.uploader import S3Uploader, BaseS3Uploader


Blueprint = flask.Blueprint
make_response = flask.make_response
redirect = toolkit.redirect_to
abort = base.abort
log = logging.getLogger(__name__)

s3_uploads = Blueprint(
    u's3_uploads',
    __name__
)


def uploaded_file_redirect(upload_to, filename):
    '''Redirect static file requests to their location on S3.'''

    storage_path = S3Uploader.get_storage_path(upload_to)
    filepath = os.path.join(storage_path, filename)
    base_uploader = BaseS3Uploader()

    try:
        url = base_uploader.get_signed_url_to_key(filepath)
    except ClientError as ex:
        if ex.response['Error']['Code'] in ['NoSuchKey', '404']:
            return abort(404, _('Keys not found on S3'))
        else:
            raise ex

    return redirect(url)

def signv4_upload():
    aws_secret = ckan_config.get("ckanext.s3filestore.aws_secret_access_key", None)
    region = ckan_config.get("ckanext.s3filestore.region_name", None)

    to_sign = str(request.args.get('to_sign')).encode('utf-8')
    date_stamp = datetime.datetime.strptime(request.args.get('datetime'), '%Y%m%dT%H%M%SZ').strftime('%Y%m%d')
    service = 's3'

    # Key derivation functions. See:
    # http://docs.aws.amazon.com/general/latest/gr/signature-v4-examples.html#signature-v4-examples-python
    def sign(key, msg):
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    def getSignatureKey(key, date_stamp, regionName, serviceName):
        kDate = sign(('AWS4' + key).encode('utf-8'), date_stamp)
        kRegion = sign(kDate, regionName)
        kService = sign(kRegion, serviceName)
        kSigning = sign(kService, 'aws4_request')
        return kSigning

    signing_key = getSignatureKey(aws_secret, date_stamp, region, service)

    # Sign to_sign using the signing_key
    signature = hmac.new(
        signing_key,
        to_sign,
        hashlib.sha256
    ).hexdigest()

    r = make_response(signature)
    r.headers['Content-Type'] = "text/HTML"
    r.headers['Access-Control-Allow-Origin'] = "*"


    return r


s3_uploads.add_url_rule(u'/uploads/<upload_to>/<filename>',
                        view_func=uploaded_file_redirect)
s3_uploads.add_url_rule(u'/auth/signv4_upload',
                        view_func=signv4_upload)


def get_blueprints():
    return [s3_uploads]
