import { CodeCommitClient } from '@aws-sdk/client-codecommit';
// Set the AWS Region.
const REGION = 'eu-central-1'; //e.g. "us-east-1"
// Create an Amazon S3 service client object.
const codeCommitClient = new CodeCommitClient({ region: REGION });
export { codeCommitClient };
