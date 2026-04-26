export async function sendVerificationEmail({ to, code }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;

    if (!apiKey || !from) {
        throw new Error('Missing RESEND_API_KEY or RESEND_FROM');
    }

    const fromWithName = `Flow Input <${from}>`;

    // 使用部署后的公开 URL
    const logoUrl = 'https://immersive-input.vercel.app/app-icon.png';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 40px 40px 30px 40px; text-align: center; border-bottom: 1px solid #e5e5e5;">
                            <img src="${logoUrl}" alt="Flow Input" style="width: 64px; height: 64px; margin-bottom: 16px; border-radius: 12px;" />
                            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #333333;">Flow Input</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; color: #333333;">Your Verification Code</h2>
                            <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.5; color: #666666;">
                                Use the following code to complete your registration:
                            </p>
                            <div style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; text-align: center; margin: 0 0 30px 0;">
                                <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #333333;">${code}</span>
                            </div>
                            <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #999999;">
                                This code will expire in 10 minutes. If you didn't request this code, please ignore this email.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0 0 10px 0; font-size: 14px; color: #666666; text-align: center;">
                                Best regards,<br>
                                <strong>Flow Input Team</strong>
                            </p>
                            <p style="margin: 0; font-size: 12px; color: #999999; text-align: center;">
                                © ${new Date().getFullYear()} Flow Input. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();

    const textContent = `Your verification code is: ${code}. It expires in 10 minutes.\n\nBest regards,\nFlow Input Team`;

    const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: fromWithName,
            to,
            subject: 'Your verification code - Flow Input',
            html: htmlContent,
            text: textContent,
        }),
    });

    if (!resp.ok) {
        let detail = '';
        try {
            detail = await resp.text();
        } catch {
            detail = '';
        }
        throw new Error(`Resend send failed: ${resp.status} ${detail}`);
    }
}

export async function sendPasswordResetEmail({ to, code }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;

    if (!apiKey || !from) {
        throw new Error('Missing RESEND_API_KEY or RESEND_FROM');
    }

    const fromWithName = `Flow Input <${from}>`;
    const logoUrl = 'https://immersive-input.vercel.app/app-icon.png';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 40px 40px 30px 40px; text-align: center; border-bottom: 1px solid #e5e5e5;">
                            <img src="${logoUrl}" alt="Flow Input" style="width: 64px; height: 64px; margin-bottom: 16px; border-radius: 12px;" />
                            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #333333;">Flow Input</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; color: #333333;">Password Reset Code</h2>
                            <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.5; color: #666666;">
                                You requested to reset your password. Use the following code to complete the process:
                            </p>
                            <div style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; text-align: center; margin: 0 0 30px 0;">
                                <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #333333;">${code}</span>
                            </div>
                            <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #999999;">
                                This code will expire in 10 minutes. If you didn't request a password reset, please ignore this email.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0 0 10px 0; font-size: 14px; color: #666666; text-align: center;">
                                Best regards,<br>
                                <strong>Flow Input Team</strong>
                            </p>
                            <p style="margin: 0; font-size: 12px; color: #999999; text-align: center;">
                                © ${new Date().getFullYear()} Flow Input. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();

    const textContent = `Password Reset Code: ${code}. It expires in 10 minutes.\n\nBest regards,\nFlow Input Team`;

    const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: fromWithName,
            to,
            subject: 'Password Reset - Flow Input',
            html: htmlContent,
            text: textContent,
        }),
    });

    if (!resp.ok) {
        let detail = '';
        try {
            detail = await resp.text();
        } catch {
            detail = '';
        }
        throw new Error(`Resend send failed: ${resp.status} ${detail}`);
    }
}
