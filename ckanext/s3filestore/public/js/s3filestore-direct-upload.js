ckan.module('s3filestore-direct-upload', function($, _) {

    return {
        options: {
            bucket: '',
            aws_key: '',
            host_url: '',
            region: ''
        },
        initialize: function() {
            $.proxyAll(this, /_on/);
            this._form = this.$('form');
            this._file = $('#field-image-upload');
            this._url = $('#field-image-url');
            this._save = $('[name=save]');
            this._id = $('input[name=id]');

            this._save.on('click', this._onSaveClick);
        },

        _onPerformUpload: function(file, dataset_id, resource_id) {
            console.log("In _onPerformUpload");
            var self = this;
            this._bucket = this.options.bucket + '/resources/' + resource_id;
            this._host = this.options.host_url == 'None' ? 'https://s3.'+this.options.region+'.amazonaws.com' : this.options.host_url + '/' + this._bucket;
            // var sandbox = this.sandbox;
            Evaporate.create({
                signerUrl: '/auth/signv4_upload?resource_id=' + resource_id,
                aws_key: this.options.aws_key,
                bucket: this._bucket,
                sendCanonicalRequestToSignerUrl: false,
                aws_url: this._host,
                awsRegion: this.options.region,
                cloudfront: this.options.host_url == 'None' ? false : true,
                awsSignatureVersion: '4',
                computeContentMd5: true,
                cryptoMd5Method: function (data) { return AWS.util.crypto.md5(data, 'base64'); },
                cryptoHexEncodedHash256: function (data) { return AWS.util.crypto.sha256(data, 'hex'); },
                logging: false,
                s3FileCacheHoursAgo: 1,
                allowS3ExistenceOptimization: true,
                sendCanonicalRequestToSignerUrl: true,
                evaporateChanged: function (file, evaporatingCount) {
                    $('#totalParts').text(evaporatingCount);
                    if (evaporatingCount > 0) {
                    $("#pause-all, #pause-all-force, #cancel-all").show();
                    } else if (evaporatingCount === 0) {
                    $("#pause-all, #pause-all-force, #resume, #cancel-all").hide();
                    }
                }
            })
                .then(function (_e_) {
                    var filePromises = [];
                    var file_id = 0;

                    var name = file.name;
                    name = name.toLowerCase().trim();
                    name = name.replace(/[^a-zA-Z0-9_. -]/g, '').replace(/ /g, '-');
                    name = name.replace(/-+/g, '-');

                    var fileKey = this._bucket + '/' + name;

                    callback_methods = callbacks(file, fileKey);

                    var promise = _e_.add({
                        name: name,
                        file: file,
                        progress: callback_methods.progress,
                        started: callback_methods.started,
                        error: callback_methods.error,
                        warn: callback_methods.warn,
                        complete: callback_methods.complete
                    }
                    )
                        .then((function (requestedName) {
                            return function (awsKey) {
                                if (awsKey === requestedName) {
                                    console.log(awsKey, 'successfully uploaded!');
                                } else {
                                    console.log('Did not re-upload', requestedName, 'because it exists as', awsKey);
                                }
                            }
                        })(name)
                        );

                    filePromises.push(promise);

                    callback_methods.progress_line.attr('file_id', file_id);

                    ["#pause-all", "#pause-all-force", "#cancel-all"].forEach(function (v) { $(v).show(); });

                    allCompleted = Promise.all(filePromises)
                        .then(function () {
                            console.log('All files were uploaded successfully.');
                            self._onFinishUpload();
                        }, function (reason) {
                            console.log('All files were not uploaded successfully:', reason);
                        })

        
                $("#pause-all").hide().click(function () {
                    _e_.pause();
                });
        
                $("#cancel-all").hide().click(function () {
                    _e_.cancel();
                });
        
                $("#pause-all-force").hide().click(function () {
                    _e_.pause(undefined, {force: true});
                });
        
                $("#resume").hide().click(function () {
                    _e_.resume();
                    $("#resume").hide();
                });
        
                function callbacks(file, fileKey) {
        
                    var progress_line = $('<div class="progress-line"/>'),
                            line,
                            progress,
                            file_id;
        
                    $('#progress-container')
                            .append(progress_line);
        
                    progress_line
                            .append('<span>' + file.name + '</span>')
                            .append('<div class="line"/>');
        
                    var status = $('<span class="status"></span>');
                    progress_line.append(status);
                    var speed = $('<span class="speed">786 Kbs</span>');
                    progress_line.append(speed);
        
                    line = new ProgressBar.Line(progress_line.find('.line')[0], {
                        strokeWidth: 10,
                        easing: 'easeInOut',
                        trailWidth: 2,
                        trailColor: '#eee',
                        duration: 1400,
                        svgStyle: {width: '100%', height: '20px'},
                        text: {
                            value: '',
                            style: {
                                // Text color.
                                // Default: same as stroke color (options.color)
                                color: '#999',
                                position: 'absolute',
                                right: '0',
                                top: '50px',
                                padding: 0,
                                margin: 0,
                                transform: null
                              }
                        },
                        step: function(state, bar) {
                            bar.setText((bar.value() * 100).toFixed(0) + '%');
                        }
                    });
        
                    progress_line.find('svg path').removeAttr('stroke');
                    progress_line.find('.progressbar-text').css('color', '');
        
        
                    function markComplete(className) {
                        progress_line.addClass(className);
                        status.text(className.charAt(0).toUpperCase() + className.slice(1));
                    }
        
                    return {
                        progress: function (progressValue, data) {
                            progress = progressValue;
                            console.log(
                                'Total Loaded:', data && data.loaded ? data.loaded : '',
                                'Speed:', data && data.speed ? data.speed : '',
                                'Formatted speed:', data && data.speed ? data.readableSpeed + 's' : '',
                                'Minutes left:', data && data.secondsLeft ? Math.round(data.secondsLeft / 60) : '')
                            line.animate(progressValue);
                            if(data) {
                            var xferRate = data.speed ? '<br />' + data.readableSpeed + "s" : '',
                                remaining = data.secondsLeft ? '<br />' + Math.round(data.secondsLeft / 60) + 'm left' : '';
                            speed.html(xferRate + remaining);
                            }
                        },
                        started: function (fid) {
                            console.log('started', fid)
                            file_id = fid;
                            progress_line.addClass('evaporating');
                            status.text('Uploading');
                        },
                        error: function (msg) {
                            var m = $('<div/>').append(msg);
                            var html = $('<small/>').html(m);
                            markComplete('error');
                            line.animate(progress);
                            progress_line.removeClass('evaporating warning');
                        },
                        warn: function (msg) {
                            var m = $('<small/>').html(msg);
                            var html = $('<div/>').append(m);
                            line.animate(progress)
                        },
                        complete: function (_xhr, awsKey, stats){
                            line.animate(1);
                            progress_line.removeClass('evaporating warning');
                            markComplete('completed');
                        },
                        progress_line: progress_line
                    }
                }
                },
                function (reason) {
                $("div.errors").html('Evaporate failed to initialize: ' + reason + '. Change parameters and refresh page.');
                });

        },

        _onSaveClick: function(event, pass) {
            if (pass || !window.FileList || !this._file || !this._file.val()) {
                return;
            }
            event.preventDefault();
            var formData = this._form.serializeArray().reduce(
                function (result, item) {
                    result[item.name] = item.value;
                    return result;
            }, {});

            console.log(formData);
            var dataset_id = this.options.package_id;
            console.log("Dataset id:" + dataset_id);
            try {
                this._onDisableSave(true);
                this._pressedSaveButton = event.target.value;
                this._onSaveForm();
            } catch(error){
                console.log(error);
                this._onDisableSave(false);
            }
        },

        _onSaveForm: function() {
            console.log("In Save form");
            var file = this._file[0].files[0];
            var self = this;
            var formData = this._form.serializeArray().reduce(
                function (result, item) {
                    result[item.name] = item.value;
                    return result;
            }, {});

            formData.url = file.name;
            formData.package_id = this.options.package_id;
            console.log("formData.package_id:" + formData.package_id);
            formData.url_type = 'upload';
            var action = formData.id ? 'resource_update' : 'resource_create';
            this.sandbox.client.call(
                'POST',
                action,
                formData,
                function (data) {
                    var result = data.result;
                    self._packageId = result.package_id;
                    self._resourceId = result.id;

                    document.getElementById("content").scrollIntoView();
                    self._onPerformUpload(file, formData.package_id, self._resourceId);
                    self._id.val(result.id);
                    self._changeTaskState(self._resourceId)
                    // this notify may not be needed
                    // self.sandbox.notify(
                    //     result.id,
                    //     self.i18n(action, {id: result.id}),
                    //     'success'
                    // );
                },
                function (err, st, msg) {
                    self.sandbox.notify(
                        'Error',
                        msg,
                        'error'
                    );
                    self._onHandleError('Unable to save resource');
                }
            );

        },

        _onDisableSave: function (value) {
            this._save.attr('disabled', value);
        },

        _changeTaskState: function(resource_id) {
            // change the task state to error so retrying datastore submit works
            var self = this;
            // get task data
            this.sandbox.client.call(
                'POST',
                'task_status_show',
                {
                    'entity_id': resource_id,
                    'task_type': 'datapusher',
                    'key': 'datapusher'
                },
                function (data) {
                    console.log(data);
                    var _task = data.result;

                    _task.state = "error";
                    self.sandbox.client.call(
                        'POST',
                        'task_status_update',
                        _task,
                        function (data) {
                            console.log(data);
                        },
                        function (err) {
                            console.log(err);
                        }
                    );
                },
                function (err) {
                    console.log(err);
                }
            );

        },

        _onFinishUpload: function() {
            var self = this;			

            this.sandbox.client.call(
                'POST',
                'datapusher_submit',
                {
                    'resource_id': this._resourceId,
                    'ignore_hash': true
                },
                function (data) {
                    console.log(data);
                    self._onDisableSave(false);

                    if (self._resourceId && self._packageId){
                        self.sandbox.notify(
                            'Success',
                            self.i18n('upload_completed'),
                            'success'
                        );
                        // self._form.remove();
                        if (self._pressedSaveButton == 'again') {
                            var path = '/dataset/new_resource/';
                        } else if (self._pressedSaveButton == 'go-dataset') {
                            var path = '/dataset/edit/';
                        } else {
                            var path = '/dataset/';
                        }
                        var redirect_url = self.sandbox.url(path + self._packageId);

                        self._form.attr('action', redirect_url);
                        self._form.attr('method', 'GET');
                        self.$('[name]').attr('name', null);
                        setTimeout(function(){
                            self._form.submit();
                        }, 3000);

                    }
                },
                function (err) {
                    console.log(err);
                    self._onHandleError(self.i18n('unable_to_finish'));
                }
            );
                
        },

        _onHandleError: function (msg) {
            this.sandbox.notify(
                'Error',
                msg,
                'error'
            );
            this._onDisableSave(false);
        }

    };
});


    