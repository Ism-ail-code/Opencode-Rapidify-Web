function baseHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Rapidify</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 16px">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%">
<tr><td style="background:#ffffff;border-radius:16px;padding:40px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding-bottom:24px;border-bottom:1px solid #eee">
<span style="font-size:20px;font-weight:700;color:#0F172A">Rapidify</span>
</td></tr>
<tr><td style="padding:24px 0">${body}</td></tr>
<tr><td style="padding-top:24px;border-top:1px solid #eee;font-size:12px;color:#94a3b8;text-align:center">
<p style="margin:0 0 4px">Rapidify — AR Commerce Platform</p>
<p style="margin:0">If you did not request this email, you can safely ignore it.</p>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function welcomeEmail(name: string): string {
  return baseHtml("Welcome to Rapidify", `
<h1 style="margin:0 0 8px;font-size:22px;color:#0F172A">Welcome to Rapidify, ${name}!</h1>
<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">
Your account has been created. You're one step away from bringing your products to life in 3D and AR.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">
<tr><td style="padding:0 0 12px">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td width="32" valign="top" style="font-size:20px;line-height:1">✅</td>
<td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.5">Create your first AR product page</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 0 12px">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td width="32" valign="top" style="font-size:20px;line-height:1">✅</td>
<td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.5">Upload photos and generate 3D models with AI</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 0 12px">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td width="32" valign="top" style="font-size:20px;line-height:1">✅</td>
<td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.5">Embed AR viewers on any website</td></tr>
</table>
</td></tr>
</table>
<p style="margin:0;font-size:14px;color:#475569;line-height:1.6">
To get started, complete your business profile and set up your store.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px">
<tr><td style="background:#0F172A;border-radius:8px;padding:12px 24px;text-align:center">
<a href="{{APP_URL}}/auth/onboarding" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:block">Complete your profile</a>
</td></tr>
</table>
`);
}

export function emailVerificationLink(name: string, verificationUrl: string): string {
  return baseHtml("Verify your email", `
<h1 style="margin:0 0 8px;font-size:22px;color:#0F172A">Verify your email address</h1>
<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">
Hi ${name}, thanks for signing up for Rapidify. Please verify your email address by clicking the button below.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;margin-bottom:24px">
<tr><td style="background:#0F172A;border-radius:8px;padding:12px 24px;text-align:center">
<a href="${verificationUrl}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:block">Verify email address</a>
</td></tr>
</table>
<p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5">
If you did not create an account, you can safely ignore this email. The link expires in 24 hours.
</p>
`);
}

export function passwordResetEmail(name: string, resetUrl: string): string {
  return baseHtml("Reset your password", `
<h1 style="margin:0 0 8px;font-size:22px;color:#0F172A">Reset your password</h1>
<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">
Hi ${name}, we received a request to reset the password for your Rapidify account. Click the button below to choose a new password.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;margin-bottom:24px">
<tr><td style="background:#0F172A;border-radius:8px;padding:12px 24px;text-align:center">
<a href="${resetUrl}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:block">Reset password</a>
</td></tr>
</table>
<p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5">
If you did not request a password reset, you can safely ignore this email. The link expires in 1 hour.
</p>
`);
}

export function onboardingCompletedEmail(name: string, businessName: string, dashboardUrl: string): string {
  return baseHtml("Your store is ready", `
<h1 style="margin:0 0 8px;font-size:22px;color:#0F172A">Welcome aboard, ${name}!</h1>
<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">
Your business profile for <strong>${businessName}</strong> is complete and your merchant workspace is live.
</p>
<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">
Here are your next steps:
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">
<tr><td style="padding:0 0 12px">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td width="32" valign="top" style="font-size:20px;line-height:1">📦</td>
<td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.5">Add your first product and upload photos</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 0 12px">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td width="32" valign="top" style="font-size:20px;line-height:1">🎨</td>
<td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.5">Generate 3D models using AI or upload your own</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 0 12px">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td width="32" valign="top" style="font-size:20px;line-height:1">🌐</td>
<td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.5">Embed AR viewers on your storefront</td></tr>
</table>
</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px">
<tr><td style="background:#0F172A;border-radius:8px;padding:12px 24px;text-align:center">
<a href="${dashboardUrl}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:block">Go to dashboard</a>
</td></tr>
</table>
`);
}

export function arModelReadyEmail(name: string, productName: string, productUrl: string): string {
  return baseHtml(`Your 3D model for ${productName} is ready`, `
<h1 style="margin:0 0 8px;font-size:22px;color:#0F172A">Your 3D model is ready!</h1>
<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">
Hi ${name}, the 3D model for <strong>${productName}</strong> has finished processing and is ready to use.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">
<tr><td style="background:#f0fdf4;border-radius:12px;padding:16px">
<p style="margin:0;font-size:14px;color:#166534;line-height:1.6">
Your product now supports:<br>
● 3D viewing on all devices<br>
● Augmented Reality on mobile<br>
● Embeddable AR widget for your store
</p>
</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px">
<tr><td style="background:#0F172A;border-radius:8px;padding:12px 24px;text-align:center">
<a href="${productUrl}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:block">View product page</a>
</td></tr>
</table>
`);
}
