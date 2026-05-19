import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({ region: "us-east-1" });

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('[ses-dev] OTP for', to, '=', code);
    return;
  }

  const command = new SendEmailCommand({
    Source: "info@ggakingclub.com",
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: "Your OTP Code" },
      Body: { Text: { Data: `Your code is: ${code}` } }
    }
  });

  await ses.send(command);
}
