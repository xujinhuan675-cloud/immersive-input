export async function sendVerificationEmail({ to, code }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;

    if (!apiKey || !from) {
        throw new Error('Missing RESEND_API_KEY or RESEND_FROM');
    }

    const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to,
            subject: 'Your verification code',
            text: `Your verification code is: ${code}. It expires in 10 minutes.`,
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
