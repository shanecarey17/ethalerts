const AWS = require('aws-sdk');

AWS.config.update({region: 'us-east-1'});

const sns = new AWS.SNS();

const publishSMS = (message, phoneNumber) => {
    var params = {
        Message: message,
        PhoneNumber: phoneNumber
    };

    sns.publish(params).promise()
        .then((data) => {
            console.log('SENT SMS');
        }).catch((err) => {
            console.log('failed to send sms');
            console.log(err);
        });
};

module.exports.publishSMS = publishSMS;
