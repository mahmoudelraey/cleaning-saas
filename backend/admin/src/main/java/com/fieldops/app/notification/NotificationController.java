package com.fieldops.app.notification;

import com.fieldops.app.common.audit.AuditNames;
import com.fieldops.app.common.audit.Audited;
import java.time.Instant;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.fieldops.app.common.web.PageResponse;
import com.fieldops.app.notification.channel.ChannelType;
import com.fieldops.app.notification.provider.NotificationProviders;
import com.fieldops.app.notification.provider.ProviderType;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.RequiresFeature;
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
    private final NotificationProviders providers;
    private final TenantRepository tenantRepo;
    private final AuditNames audits;

    public NotificationController(NotificationService notifications, TenantService tenants,
                                  NotificationProviders providers, TenantRepository tenantRepo, AuditNames audits) {
        this.audits = audits;
        this.notifications = notifications;
        this.tenants = tenants;
        this.providers = providers;
        this.tenantRepo = tenantRepo;
    }

    /** The whole company's send log: the Messages page, only on plans with {@code messages}. */
    @GetMapping("/api/v1/notifications")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    @RequiresFeature(PlanFeature.MESSAGES)
    public PageResponse<Audited<NotificationDto>> list(@RequestParam(defaultValue = "0") @Min(0) int page,
                                              @RequestParam(defaultValue = "30") @Min(1) @Max(100) int size) {
        return audits.page(notifications.list(null, PageRequest.of(page, size)), NotificationDto::of);
    }

    /** Messages of one booking (booking page), on every plan. */
    @GetMapping("/api/v1/bookings/{bookingId}/messages")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public PageResponse<Audited<NotificationDto>> forBooking(@PathVariable UUID bookingId,
                                              @RequestParam(defaultValue = "0") @Min(0) int page,
                                              @RequestParam(defaultValue = "30") @Min(1) @Max(100) int size) {
        return audits.page(notifications.list(bookingId, PageRequest.of(page, size)), NotificationDto::of);
    }

    /** Failed messages of the last 7 days, for the bell's "needs attention" list, on every plan. */
    @GetMapping("/api/v1/notifications/failed")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public java.util.List<NotificationDto> recentFailures() {
        return notifications.recentFailures().stream().map(NotificationDto::of).toList();
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
        return SettingsDto.of(tenants.current(), providers);
    }

    // Which customer messages a company sends is decided by the platform admin only (Platform → Companies);
    // company owners can no longer change it.

    @GetMapping("/api/platform/companies/{id}/customer-messages")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    @Transactional(readOnly = true)
    public SettingsDto companySettings(@PathVariable UUID id) {
        return SettingsDto.of(company(id), providers);
    }

    @PutMapping("/api/platform/companies/{id}/customer-messages")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    @Transactional
    public SettingsDto updateCompanySettings(@PathVariable UUID id, @Valid @RequestBody SettingsRequest req) {
        Tenant t = company(id);
        t.updateNotificationSettings(req.confirmation(), req.reminder(), req.onTheWay(), req.completed(),
                req.cancelled(), req.reminderHours());
        return SettingsDto.of(t, providers);
    }

    private Tenant company(UUID id) {
        return tenantRepo.findById(id).filter(t -> !t.isPlatform()).orElseThrow(() -> ApiException.notFound("tenant"));
    }

    public record SettingsRequest(boolean confirmation, boolean reminder, boolean onTheWay, boolean completed,
                                  boolean cancelled, @Min(1) @Max(48) int reminderHours) {
    }

    public record SettingsDto(boolean confirmation, boolean reminder, boolean onTheWay, boolean completed,
                              boolean cancelled, int reminderHours, boolean whatsappConfigured, boolean smsConfigured) {
        static SettingsDto of(Tenant t, NotificationProviders providers) {
            boolean wa = providers.available(ChannelType.WHATSAPP);
            boolean sms = providers.available(ChannelType.SMS);
            return new SettingsDto(t.isNotifyConfirmation(), t.isNotifyReminder(), t.isNotifyOnTheWay(),
                    t.isNotifyCompleted(), t.isNotifyCancelled(), t.getReminderHours(), wa, sms);
        }
    }

    public record NotificationDto(UUID id, UUID bookingId, NotificationTemplate template, ChannelType channel,
                                  ProviderType provider, String toPhone, String body, Notification.Status status, String error, int attempts,
                                  Instant createdAt, Instant sentAt, Instant deliveredAt) {
        static NotificationDto of(Notification n) {
            return new NotificationDto(n.getId(), n.getBookingId(), n.getTemplate(), n.getChannel(), n.getProvider(),
                    n.getToPhone(),
                    n.getTemplate() == NotificationTemplate.OTP ? "••••" : n.getBody(), n.getStatus(), n.getError(),
                    n.getAttempts(), n.getCreatedAt(), n.getSentAt(), n.getDeliveredAt());
        }
    }
}
