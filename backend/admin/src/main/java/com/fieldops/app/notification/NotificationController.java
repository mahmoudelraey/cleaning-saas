package com.fieldops.app.notification;

import java.time.Instant;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.fieldops.app.common.web.PageResponse;
import com.fieldops.app.notification.channel.ChannelType;
import com.fieldops.app.notification.channel.MessageChannel;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantRepository;
import com.fieldops.app.tenant.TenantService;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class NotificationController {

    private final NotificationService notifications;
    private final TenantService tenants;
    private final java.util.List<MessageChannel> channels;
    private final TenantRepository tenantRepo;

    public NotificationController(NotificationService notifications, TenantService tenants,
                                  java.util.List<MessageChannel> channels, TenantRepository tenantRepo) {
        this.notifications = notifications;
        this.tenants = tenants;
        this.channels = channels;
        this.tenantRepo = tenantRepo;
    }

    /** Send log (whole company or one booking). */
    @GetMapping("/api/v1/notifications")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public PageResponse<NotificationDto> list(@RequestParam(required = false) UUID bookingId,
                                              @RequestParam(defaultValue = "0") @Min(0) int page,
                                              @RequestParam(defaultValue = "30") @Min(1) @Max(100) int size) {
        return PageResponse.of(notifications.list(bookingId, PageRequest.of(page, size)), NotificationDto::of);
    }

    /** The office writes to the booking's customer (WhatsApp, SMS fallback). */
    @PostMapping("/api/v1/bookings/{bookingId}/messages")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    @ResponseStatus(HttpStatus.CREATED)
    public NotificationDto sendCustom(@PathVariable UUID bookingId, @Valid @RequestBody CustomMessageRequest req) {
        return NotificationDto.of(notifications.sendCustom(bookingId, req.message()));
    }

    public record CustomMessageRequest(@NotBlank @Size(max = NotificationService.CUSTOM_MESSAGE_MAX) String message) {
    }

    @GetMapping("/api/v1/tenant/notification-settings")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public SettingsDto settings() {
        return SettingsDto.of(tenants.current(), channels);
    }

    // Which customer messages a company sends is decided by the platform admin only (Platform → Companies);
    // company owners can no longer change it.

    @GetMapping("/api/platform/companies/{id}/customer-messages")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    @Transactional(readOnly = true)
    public SettingsDto companySettings(@PathVariable UUID id) {
        return SettingsDto.of(company(id), channels);
    }

    @PutMapping("/api/platform/companies/{id}/customer-messages")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    @Transactional
    public SettingsDto updateCompanySettings(@PathVariable UUID id, @Valid @RequestBody SettingsRequest req) {
        Tenant t = company(id);
        t.updateNotificationSettings(req.confirmation(), req.reminder(), req.onTheWay(), req.completed(),
                req.cancelled(), req.reminderHours());
        return SettingsDto.of(t, channels);
    }

    private Tenant company(UUID id) {
        return tenantRepo.findById(id).filter(t -> !t.isPlatform()).orElseThrow(() -> ApiException.notFound("tenant"));
    }

    public record SettingsRequest(boolean confirmation, boolean reminder, boolean onTheWay, boolean completed,
                                  boolean cancelled, @Min(1) @Max(48) int reminderHours) {
    }

    public record SettingsDto(boolean confirmation, boolean reminder, boolean onTheWay, boolean completed,
                              boolean cancelled, int reminderHours, boolean whatsappConfigured, boolean smsConfigured) {
        static SettingsDto of(Tenant t, java.util.List<MessageChannel> channels) {
            boolean wa = channels.stream().anyMatch(c -> c.type() == ChannelType.WHATSAPP && c.isEnabled());
            boolean sms = channels.stream().anyMatch(c -> c.type() == ChannelType.SMS && c.isEnabled());
            return new SettingsDto(t.isNotifyConfirmation(), t.isNotifyReminder(), t.isNotifyOnTheWay(),
                    t.isNotifyCompleted(), t.isNotifyCancelled(), t.getReminderHours(), wa, sms);
        }
    }

    public record NotificationDto(UUID id, UUID bookingId, NotificationTemplate template, ChannelType channel,
                                  String toPhone, String body, Notification.Status status, String error, int attempts,
                                  Instant createdAt, Instant sentAt, Instant deliveredAt) {
        static NotificationDto of(Notification n) {
            return new NotificationDto(n.getId(), n.getBookingId(), n.getTemplate(), n.getChannel(), n.getToPhone(),
                    n.getTemplate() == NotificationTemplate.OTP ? "••••" : n.getBody(), n.getStatus(), n.getError(),
                    n.getAttempts(), n.getCreatedAt(), n.getSentAt(), n.getDeliveredAt());
        }
    }
}
