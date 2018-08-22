"use strict";

const {NodeVM,VMScript} = require("vm2");
const fs = require("fs");
const aws = require("aws-sdk");
const nodemailer = require("nodemailer");
const got = require('got');
const fetch = require('node-fetch');

const conf = JSON.parse(fs.readFileSync('conf.json', 'utf8'));
const originalLambda = fs.readFileSync(conf.originalLambda, 'utf8');

let handlerName = "handler";

const originalLambdaScript = new VMScript(`

module.exports.runReplayed = (externalEvent, externalContext, externalCallback) => {

    debugger;
    
    ${originalLambda}
    
    module.exports.${handlerName}(externalEvent, externalContext, externalCallback);

}
`);

const processEnv = {};
for (let envVar of conf.processEnv) {
    processEnv[envVar] = process.env[envVar];
}

let executionEnv = {
    console: 'inherit',
    sandbox: {
        process: {
            env: processEnv,
        },
        // externalEvent: event,
        // externalContext: context,
        // externalCallback: callback,
        Math : new Proxy(Math, {get: (target, p) => p==="random" ? recordWrapperSync(Math.random()) : target[p]}),
    },
    require: {
        context: 'sandbox',
        external: true,
        builtin: ['fs', 'url'],
        root: "./",
        // mock: {
        //     'aws-sdk': {
        //         config: aws.config,
        //
        //         Kinesis: function () {
        //             const kinesis = new aws.Kinesis();
        //             return {
        //                 putRecord: recordWrapperCallback(kinesis.putRecord),
        //             }
        //         },
        //
        //         StepFunctions: function () {
        //             const stepfunctions = new aws.StepFunctions();
        //             return {
        //                 startExecution: recordWrapperCallback(stepfunctions.startExecution),
        //                 getActivityTask: recordWrapperCallback(stepfunctions.getActivityTask),
        //                 sendTaskFailure: recordWrapperCallback(stepfunctions.sendTaskFailure),
        //                 sendTaskSuccess: recordWrapperCallback(stepfunctions.sendTaskSuccess),
        //             }
        //         },
        //
        //         Rekognition: function () {
        //             const rek = new aws.Rekognition();
        //
        //             return {
        //                 detectLabels: recordWrapperCallback(rek.detectLabels),
        //             }
        //         },
        //     },
        //     'nodemailer' : {
        //         createTransport: (params) => {
        //             const mailer = nodemailer.createTransport(params);
        //
        //             return {
        //                 sendMail: recordWrapperPromise(mailer.sendMail),
        //             }
        //         },
        //         getTestMessageUrl: recordWrapperPromise(nodemailer.getTestMessageUrl),
        //     },
        //     'got' : {
        //         get: recordWrapperPromise(got.get),
        //     },
        //     'node-fetch' : recordWrapperPromise(fetch)
        // }
    },
};

const vm = new NodeVM(executionEnv);

const vmModule = vm.run(originalLambdaScript, conf.secLambdaFullPath);

var cloudwatchlogs = new aws.CloudWatchLogs({region: "us-west-1"});


var params = {
    logGroupName: '/aws/lambda/hello-world-recorded-dev-hello',
    logStreamNames: ['2018/08/20/[$LATEST]f18b94a01da2400085ce026912702ec8'],
    // filterPattern: 'START RequestId\\\:', // Doesn't work!!
    // filterPattern: '"4cabcdff-"',
    // filterPattern: '4cabcdff',
    filterPattern: '"4cabcdff-a4ba-11e8-aaeb-d37728f6aa8f"',
    // filterPattern: 'RequestId',
    // filterPattern: 'START RequestId',
    // filterPattern: 'START',
    // filterPattern: '4cabcdff-a4ba-11e8-aaeb-d37728f6aa8f',
    // endTime: 0,
    // limit: 0,
    // nextToken: 'STRING_VALUE',
    // startFromHead: true || false,
    // startTime: 0
};
cloudwatchlogs.filterLogEvents(params, function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else {
        // console.log(data);

        debugger;

        const eventIdx = data.events.findIndex(e => e.message.indexOf('\t#### EVENT ####\n') > -1);
        const eventMessageString = data.events[eventIdx + 1].message;

        const eventString = eventMessageString.slice(eventMessageString.indexOf("\t{"));
        const event = JSON.parse(eventString);

        vmModule.runReplayed(event, {}, () => {});

    }           // successful response
});
