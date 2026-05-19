import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY!,
  },
});

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const command = new SendEmailCommand({
    Source: process.env.SES_OTP_FROM,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: html } },
    },
    ConfigurationSetName: process.env.SES_CONFIGURATION_SET,
  });

  return sesClient.send(command);
}
