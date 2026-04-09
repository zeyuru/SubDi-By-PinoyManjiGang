<?php
/**
 * Villa Purita — Mailer
 *
 * Uses PHPMailer via Composer OR falls back to PHP's native mail().
 * Configure via environment variables (or your .env / config file):
 *
 *   MAIL_HOST       — SMTP host        e.g. smtp.gmail.com
 *   MAIL_PORT       — SMTP port        e.g. 587
 *   MAIL_USERNAME   — SMTP username    e.g. yourapp@gmail.com
 *   MAIL_PASSWORD   — SMTP password    (App Password for Gmail)
 *   MAIL_ENCRYPTION — tls | ssl        default: tls
 *   MAIL_FROM_EMAIL — From address     e.g. noreply@villapurita.com
 *   MAIL_FROM_NAME  — From name        e.g. Villa Purita HOA
 *   APP_URL         — Base URL         e.g. http://localhost/villa_purita
 *
 * To install PHPMailer:
 *   composer require phpmailer/phpmailer
 */
class Mailer {

    private static function getConfig(): array {
        return [
            'host'       => getenv('MAIL_HOST')       ?: 'smtp.gmail.com',
            'port'       => (int)(getenv('MAIL_PORT') ?: 587),
            'username'   => getenv('MAIL_USERNAME')   ?: '',
            'password'   => getenv('MAIL_PASSWORD')   ?: '',
            'encryption' => getenv('MAIL_ENCRYPTION') ?: 'tls',
            'from_email' => getenv('MAIL_FROM_EMAIL') ?: 'noreply@villapurita.com',
            'from_name'  => getenv('MAIL_FROM_NAME')  ?: 'Villa Purita HOA',
            'app_url'    => rtrim(getenv('APP_URL') ?: 'http://localhost/villa_purita', '/'),
        ];
    }

    /**
     * Send an email.
     * Returns true on success, throws Exception on failure.
     */
    public static function send(string $toEmail, string $toName, string $subject, string $htmlBody): bool {
        $cfg = self::getConfig();

        // Try PHPMailer if available (installed via Composer)
        $composerAutoload = dirname(__DIR__, 2) . '/vendor/autoload.php';
        if (file_exists($composerAutoload)) {
            require_once $composerAutoload;
            if (class_exists('PHPMailer\PHPMailer\PHPMailer')) {
                return self::sendViaPHPMailer($cfg, $toEmail, $toName, $subject, $htmlBody);
            }
        }

        // Fallback: PHP native mail() — works if server has sendmail configured
        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-type: text/html; charset=UTF-8\r\n";
        $headers .= "From: {$cfg['from_name']} <{$cfg['from_email']}>\r\n";
        $headers .= "Reply-To: {$cfg['from_email']}\r\n";

        if (!mail($toEmail, $subject, $htmlBody, $headers)) {
            throw new \RuntimeException("mail() failed. Check server sendmail configuration or install PHPMailer.");
        }
        return true;
    }

    private static function sendViaPHPMailer(array $cfg, string $toEmail, string $toName, string $subject, string $htmlBody): bool {
        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host       = $cfg['host'];
        $mail->SMTPAuth   = true;
        $mail->Username   = $cfg['username'];
        $mail->Password   = $cfg['password'];
        $mail->SMTPSecure = $cfg['encryption'] === 'ssl'
            ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMIME
            : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $cfg['port'];
        $mail->setFrom($cfg['from_email'], $cfg['from_name']);
        $mail->addAddress($toEmail, $toName);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $htmlBody;
        $mail->AltBody = strip_tags(str_replace(['<br>', '<br/>'], "\n", $htmlBody));
        $mail->send();
        return true;
    }

    // ════════════════════════════════════════════════════════════
    // EMAIL TEMPLATES
    // ════════════════════════════════════════════════════════════

    /**
     * Email sent when admin creates a new account.
     * Includes the randomized password.
     */
    public static function sendWelcome(string $toEmail, string $toName, string $username, string $password, string $role): bool {
        $cfg     = self::getConfig();
        $appUrl  = $cfg['app_url'];
        $subject = "Welcome to Villa Purita — Your Account Details";
        $html = self::wrapTemplate("🏘️ Welcome to Villa Purita", "
            <p style='margin:0 0 16px;color:#94a3b8;'>Hello, <strong style='color:#e2e8f0;'>{$toName}</strong>!</p>
            <p style='margin:0 0 16px;color:#94a3b8;'>Your <strong style='color:#e2e8f0;'>{$role}</strong> account has been created by the administrator. Here are your login credentials:</p>

            <div style='background:#1a2235;border:1px solid #1e2d47;border-radius:10px;padding:20px;margin:20px 0;'>
              <table style='width:100%;font-size:14px;'>
                <tr><td style='color:#64748b;padding:6px 0;width:120px;'>🌐 System</td><td style='color:#e2e8f0;font-weight:600;'>Villa Purita Subdivision</td></tr>
                <tr><td style='color:#64748b;padding:6px 0;'>👤 Username</td><td style='color:#3b82f6;font-weight:700;font-size:16px;letter-spacing:.5px;'>{$username}</td></tr>
                <tr><td style='color:#64748b;padding:6px 0;'>🔑 Password</td><td style='color:#10b981;font-weight:700;font-size:16px;font-family:monospace;letter-spacing:1px;'>{$password}</td></tr>
                <tr><td style='color:#64748b;padding:6px 0;'>🎭 Role</td><td style='color:#e2e8f0;'>{$role}</td></tr>
              </table>
            </div>

            <div style='background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:12px 16px;margin-bottom:20px;'>
              <p style='margin:0;color:#fcd34d;font-size:13px;'>⚠️ <strong>Important:</strong> For your security, please change your password after your first login via <em>Account Settings</em>.</p>
            </div>

            <a href='{$appUrl}' style='display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;'>Sign In Now →</a>
        ");
        return self::send($toEmail, $toName, $subject, $html);
    }

    /**
     * Email sent when user requests a password reset.
     * Includes the new temporary password (simpler UX for a non-public HOA system).
     */
    public static function sendPasswordReset(string $toEmail, string $toName, string $username, string $newPassword): bool {
        $cfg     = self::getConfig();
        $appUrl  = $cfg['app_url'];
        $subject = "Villa Purita - Password Reset";
        $html = self::wrapTemplate("🔑 Password Reset", "
            <p style='margin:0 0 16px;color:#94a3b8;'>Hello, <strong style='color:#e2e8f0;'>{$toName}</strong>!</p>
            <p style='margin:0 0 16px;color:#94a3b8;'>We received a request to reset your password for your Villa Purita account. Your new temporary password is:</p>

            <div style='background:#1a2235;border:1px solid #1e2d47;border-radius:10px;padding:20px;margin:20px 0;text-align:center;'>
              <div style='color:#64748b;font-size:12px;margin-bottom:8px;letter-spacing:2px;text-transform:uppercase;'>Your New Password</div>
              <div style='color:#10b981;font-weight:700;font-size:26px;font-family:monospace;letter-spacing:3px;'>{$newPassword}</div>
              <div style='color:#475569;font-size:11px;margin-top:8px;'>Username: <strong style='color:#94a3b8;'>{$username}</strong></div>
            </div>

            <div style='background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:12px 16px;margin-bottom:20px;'>
              <p style='margin:0;color:#fcd34d;font-size:13px;'>⚠️ <strong>Important:</strong> This password will expire in <strong>1 hour</strong>. Please log in and change it immediately via <em>Account Settings</em>.</p>
            </div>

            <p style='margin:0 0 20px;color:#64748b;font-size:12px;'>If you did not request a password reset, please ignore this email. Your password has not been changed until you use the code above.</p>

            <a href='{$appUrl}' style='display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;'>Sign In Now →</a>
        ");
        return self::send($toEmail, $toName, $subject, $html);
    }

    /**
     * Shared HTML wrapper — consistent dark-themed email template.
     */
    private static function wrapTemplate(string $title, string $content): string {
        $cfg = self::getConfig();
        return <<<HTML
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b0f1a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#141c2e;border:1px solid #1e2d47;border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e3a5f,#0f2342);padding:28px 32px;text-align:center;">
          <div style="font-size:32px;margin-bottom:10px;">🏘️</div>
          <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:800;font-size:20px;color:#e2e8f0;letter-spacing:.5px;">Villa Purita Subdivision</div>
          <div style="font-size:12px;color:#64748b;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Minglanilla, Cebu</div>
          <div style="margin-top:16px;font-size:16px;font-weight:700;color:#3b82f6;">{$title}</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          {$content}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #1e2d47;text-align:center;">
          <p style="margin:0;color:#475569;font-size:11px;line-height:1.6;">
            This email was sent by the <strong style="color:#64748b;">{$cfg['from_name']}</strong> Management System.<br>
            If you have questions, please contact your HOA administrator.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;
    }
}
