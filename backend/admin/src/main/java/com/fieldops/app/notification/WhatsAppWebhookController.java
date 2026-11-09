package com.fieldops.app.notification;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.notification.channel.NotificationProperties;
import com.fieldops.app.platform.PlatformSettingsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Delivery receipts from Meta (plan endpoint {@code /api/v1/webhooks/whatsapp}). Every POST must carry a
 * valid {@code X-Hub-Signature-256} HMAC of the raw body; unsigned or forged calls are rejected.
 */
@RestController
@RequestMapping("/api/v1/webhooks/whatsapp")
public class WhatsAppWebhookController {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppWebhookController.class);
    private static final Map<String, Notification.Status> STATUS = Map.of(
            "sent", Notification.Status.SENT,
            "delivered", Notification.Status.DELIVERED,
            "read", Notification.Status.READ,
            "failed", Notification.Status.FAILED);

    private final PlatformSettingsService settings;
    private final NotificationRefRepository refs;
    private final NotificationRepository notifications;
    private final TransactionTemplate tx;
    private final ObjectMapper json;

    public WhatsAppWebhookController(PlatformSettingsService settings, NotificationRefRepository refs,
                                     NotificationRepository notifications, TransactionTemplate tx, ObjectMapper json) {
        this.settings = settings;
        this.refs = refs;
        this.notifications = notifications;
        this.tx = tx;
        this.json = json;
    }

    /** Meta's one-time subscription check. */
    @GetMapping
    public ResponseEntity<String> verify(@RequestParam(name = "hub.mode", required = false) String mode,
                                         @RequestParam(name = "hub.verify_token", required = false) String token,
                                         @RequestParam(name = "hub.challenge", required = false) String challenge) {
        NotificationProperties.WhatsApp config = settings.whatsapp();
        if ("subscribe".equals(mode) && config.verifyToken() != null && !config.verifyToken().isBlank()
                && MessageDigest.isEqual(config.verifyToken().getBytes(StandardCharsets.UTF_8),
                String.valueOf(token).getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.ok(challenge);
        }
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @PostMapping
    public ResponseEntity<Void> receive(@RequestBody byte[] body,
                                        @RequestHeader(name = "X-Hub-Signature-256", required = false) String signature) {
        if (!validSignature(body, signature)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            JsonNode root = json.readTree(body);
            for (JsonNode entry : root.path("entry")) {
                for (JsonNode change : entry.path("changes")) {
                    for (JsonNode st : change.path("value").path("statuses")) {
                        apply(st.path("id").asText(null), st.path("status").asText(""), st.path("timestamp").asLong(0));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Could not process WhatsApp webhook: {}", e.getMessage());
        }
        // Always 200 for a valid signature, otherwise Meta keeps retrying the same payload.
        return ResponseEntity.ok().build();
    }

    private void apply(String providerId, String status, long epochSeconds) {
        Notification.Status mapped = STATUS.get(status);
        if (providerId == null || mapped == null) {
            return;
        }
        refs.findById(providerId).ifPresent(ref -> TenantContext.runAs(ref.getTenantId(), () ->
                tx.executeWithoutResult(s -> notifications.findById(ref.getNotificationId()).ifPresent(n ->
                        n.markDelivery(mapped, epochSeconds > 0 ? Instant.ofEpochSecond(epochSeconds) : Instant.now())))));
    }

    private boolean validSignature(byte[] body, String header) {
        String secret = settings.whatsapp().appSecret();
        if (secret == null || secret.isBlank() || header == null || !header.startsWith("sha256=")) {
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] expected = mac.doFinal(body);
            byte[] given = HexFormat.of().parseHex(header.substring("sha256=".length()));
            return MessageDigest.isEqual(expected, given);
        } catch (Exception e) {
            return false;
        }
    }
}
