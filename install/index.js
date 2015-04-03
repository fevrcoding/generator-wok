'use strict';

var path = require('path');
var util = require('util');
var generators = require('yeoman-generator');
var _ = require('lodash');
var chalk = require('chalk');
var GitHub = require('github');
var common = require('../common.js');

var installGenerator = generators.NamedBase.extend({

    _logHeading: function (msg) {
        this.log("\n");
        this.log.writeln(chalk.bold(msg));
        this.log.writeln(chalk.bold('-------------------------------'));
    },

    // The name `constructor` is important here
    constructor: function () {
        // Calling the super constructor is important so our generator is correctly set up
        generators.NamedBase.apply(this, arguments);

        this.answers = {};
        this.moduleName = 'wok-module-' + this.name;
        this.gitRepo = null;
        this.files = this.expandFiles('**/*', {
            cwd: this.destinationPath(),
            dot: true
        });
    },

    startup: function () {
          this._logHeading('Searching for module `' + this.moduleName + '`...');
    },

    searchPlugin: function () {
        var done = this.async(),
            github = new GitHub({
                version: '3.0.0'
            });

        github.search.repos({
            q: (this.moduleName + '+in:name')
        }, function (err, response) {
            if (err || !response.items.length) {
                this.log.error('Module `' + this.moduleName + '` not found');
                return false;
            } else {
                //keep the first result
                this.gitRepo = response.items[0];
                done();
            }
        }.bind(this));
    },

    confirmInstall: function () {
        var done = this.async(),
            _answers = this.answers;

        this.prompt([{
            type: 'confirm',
            name: 'installConfirm',
            message: 'Install module `' + this.moduleName + '` from ' + this.gitRepo.url,
            'default': true
        }], function (answers) {
            _answers.installConfirm = answers.installConfirm;
            done();
        });
    },

    moduleInstall: function () {
        common.moduleInstall.apply(this, [this.moduleName]);
    }
});

module.exports = installGenerator;