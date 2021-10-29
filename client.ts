import { CodeCommitClient } from '@aws-sdk/client-codecommit';

const util = require('util');

// Set the AWS Region.
const REGION = 'eu-central-1'; //e.g. "us-east-1"

// Create an Amazon S3 service client object.
const client = new CodeCommitClient({ region: REGION });

export { client };

export function isObject(val: any) {
    if (val === null) {
        return false;
    }
    return typeof val === 'function' || typeof val === 'object';
}

export function log(...inputs: any[]) {
    const logs = inputs.map(i =>
        !isObject(i) ? i : util.inspect(i, { showHidden: false, depth: null, colors: true }),
    );
    console.log(...logs);
}
