'use strict';

var path = require('path');
var _ = require('lodash');
var chalk = require('chalk');

module.exports = {

    moduleInstall: function (modName) {
        var done = this.async();

        if (_.has(this.answers, 'installConfirm') && this.answers.installConfirm === false) {
            this.log(chalk.yellow('User cancelled'));
            done();
            return false;
        }

        this.remote(this.gitRepo.owner.login, this.gitRepo.name, 'master', function (err, remote, files) {
            var mod = require(path.join(remote.cachePath, 'index.js'))(remote, files, this);
            mod.install(done);
        }.bind(this));
    },

    copyFiles: function () {
        this.files.forEach(function (fileItem) {
            if (_.isString(fileItem.content) && !_.isEmpty(fileItem.content)) {
                fileItem.remote.dest.write(fileItem.pathTo, fileItem.content);
            } else {
                fileItem.remote.copy(fileItem.pathFrom, fileItem.pathTo);
            }
        });
    }
};