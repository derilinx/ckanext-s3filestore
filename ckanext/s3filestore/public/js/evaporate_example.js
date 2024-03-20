
var BUCKET = 'saj-test-direct-upload';
var AWS_KEY = 'FOX9Q7N655S1HF7CPAKE';
var SIGNER_URL = '/auth/signv4_upload';


Evaporate.create({
	signerUrl: SIGNER_URL,
	aws_key: AWS_KEY,
	bucket: BUCKET + '/resources/5458cb1b-3439-45e4-a88b-b6580ee38565',
	sendCanonicalRequestToSignerUrl: false,
	aws_url: 'https://eu-central-1.linodeobjects.com/' + BUCKET + '/resources/5458cb1b-3439-45e4-a88b-b6580ee38565',
	awsRegion: 'eu-central-1',
	cloudfront: true,
	awsSignatureVersion: '4',
	computeContentMd5: true,
	cryptoMd5Method: function (data) { return AWS.util.crypto.md5(data, 'base64'); },
	cryptoHexEncodedHash256: function (data) { return AWS.util.crypto.sha256(data, 'hex'); },
	logging: false,
	s3FileCacheHoursAgo: 1,
	allowS3ExistenceOptimization: true,
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
		$('#file').change(function (evt) {
			file = evt.target.files[0];
			var filePromises = [];
			var file_id = 0;

			var name = file.name;

			var fileKey = BUCKET + '/resources/5458cb1b-3439-45e4-a88b-b6580ee38565/' + name;

			callback_methods = callbacks(file, fileKey);

			var promise = _e_.add({
				name: name,
				file: file,
				started: callback_methods.started,
				complete: callback_methods.complete,
				cancelled: callback_methods.cancelled,
				progress: callback_methods.progress,
				error: callback_methods.error,
				warn: callback_methods.warn,
				paused: callback_methods.paused,
				pausing: callback_methods.pausing,
				resumed: callback_methods.resumed,
				nameChanged: callback_methods.nameChanged
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

			callback_methods.progress_clock.attr('file_id', file_id);

			["#pause-all", "#pause-all-force", "#cancel-all"].forEach(function (v) { $(v).show(); });

			allCompleted = Promise.all(filePromises)
				.then(function () {
					console.log('All files were uploaded successfully.');
				}, function (reason) {
					console.log('All files were not uploaded successfully:', reason);
				})

			$(evt.target).val('');

		});

		$("#pause-all").hide().click(function () {
			_e_.pause();
		});

		$("#cancel-all").hide().click(function () {
			_e_.cancel();
		});

		$("#pause-all-force").hide().click(function () {
			_e_.pause(undefined, { force: true });
		});

		$("#resume").hide().click(function () {
			_e_.resume();
			$("#resume").hide();
		});

		function callbacks(file, fileKey) {

			var progress_clock = $('<div class="progress-clock"/>'),
				clock,
				progress,
				file_id;

			$('#progress-container')
				.append(progress_clock);

			progress_clock
				.append('<span>' + file.name + '</span>')
				.append('<div class="circle"/>');
			var cancel = $('<button class="cancel btn btn-danger btn-xs glyphicon glyphicon-stop" title="Cancel"></button>')
				.click(function () {
					console.log('canceling', fileKey);
					_e_.cancel(fileKey);
				});
			progress_clock.append(cancel);

			var pause = $('<button class="pause btn btn-warning btn-xs glyphicon glyphicon-pause" title="Pause"></button>')
				.click(function () {
					console.log('pausing', fileKey);
					_e_.pause(fileKey);
				});
			progress_clock.append(pause);

			var forcePause = $('<button class="pause btn btn-primary btn-xs glyphicon glyphicon glyphicon-off" title="Force Pause"></button>')
				.click(function () {
					console.log('force pausing', fileKey);
					_e_.pause(fileKey, { force: true });
				});
			progress_clock.append(forcePause);

			var resume = $('<button class="resume btn btn-success btn-xs glyphicon glyphicon-play" title="Resume"></button>').hide()
				.hide()
				.click(function () {
					console.log('resuming', fileKey);
					_e_.resume(fileKey);
				});
			progress_clock.append(resume);

			var status = $('<span class="status"></span>');
			progress_clock.append(status);
			var speed = $('<span class="speed">786 Kbs</span>');
			progress_clock.append(speed);

			clock = new ProgressBar.Circle(progress_clock.find('.circle')[0], {
				strokeWidth: 3,
				trailWidth: 1,
				duration: 350,
				text: {
					value: ''
				},
				step: function (state, bar) {
					bar.setText((bar.value() * 100).toFixed(0) + '%');
				}
			});

			progress_clock.find('svg path').removeAttr('stroke');
			progress_clock.find('.progressbar-text').css('color', '');


			function markComplete(className) {
				progress_clock.addClass(className);
				status.text(className);
			}

			return {
				progress: function (progressValue, data) {
					progress = progressValue;
					console.log(
						'Total Loaded:', data && data.loaded ? data.loaded : '',
						'Speed:', data && data.speed ? data.speed : '',
						'Formatted speed:', data && data.speed ? data.readableSpeed + 's' : '',
						'Minutes left:', data && data.secondsLeft ? Math.round(data.secondsLeft / 60) : '')
					clock.animate(progressValue);
					if (data) {
						var xferRate = data.speed ? '<br />' + data.readableSpeed + "s" : '',
							remaining = data.secondsLeft ? '<br />' + Math.round(data.secondsLeft / 60) + 'm left' : '';
						speed.html(xferRate + remaining);
					}
				},
				started: function (fid) {
					console.log('started', fid)
					file_id = fid;
					pause.show();
					forcePause.show();
					resume.hide();
					progress_clock.addClass('evaporating');
					status.text('evaporating');
				},
				error: function (msg) {
					var m = $('<div/>').append(msg);
					var html = $('<small/>').html(m);
					markComplete('error');
					clock.animate(progress);
					progress_clock.removeClass('evaporating warning');
				},
				cancelled: function () {
					clock.animate(progress);
					markComplete('canceled');
					progress_clock.removeClass('evaporating warning paused pausing');
					cancel.hide();
					resume.hide();
					pause.hide();
					forcePause.hide();
				},
				pausing: function () {
					clock.animate(progress);
					markComplete('pausing');
					$("#resume").show();
					pause.hide();
					forcePause.hide();

					progress_clock.removeClass('evaporating warning');
				},
				paused: function () {
					clock.animate(progress);
					markComplete('paused');
					pause.hide();
					forcePause.hide();

					resume.show();
					$("#resume").show();
					progress_clock.removeClass('evaporating warning pausing');
				},
				resumed: function () {
					clock.animate(progress);
					markComplete('');
					resume.hide();
					progress_clock.removeClass('pausing paused');
				},
				warn: function (msg) {
					var m = $('<small/>').html(msg);
					var html = $('<div/>').append(m);
					clock.animate(progress)
				},
				nameChanged: function (awsKey) {
					console.log('Evaporate will use existing S3 upload for', awsKey,
						'rather than the requested object name', file_id)
				},
				complete: function (_xhr, awsKey, stats) {
					var m = $('<small/>').html(awsKey + ' - Completed');
					var html = $('<div/>').append(m);
					clock.animate(1);
					progress_clock.removeClass('evaporating warning');
					markComplete('completed');
					console.log('Stats for', decodeURIComponent(awsKey), stats);
				},
				progress_clock: progress_clock
			}
		}
	},
		function (reason) {
			$("div.errors").html('Evaporate failed to initialize: ' + reason + '. Change parameters and refresh page.');
		});
