package com.fieldops.app.notification;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Background jobs. Disabled with {@code app.jobs.enabled=false} (tests call the services directly). */
@Component
@ConditionalOnProperty(name = "app.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class NotificationJobs {

    private static final Logger log = LoggerFactory.getLogger(NotificationJobs.class);

    private final NotificationDispatcher dispatcher;
    private final ReminderService reminders;

    public NotificationJobs(NotificationDispatcher dispatcher, ReminderService reminders) {
        this.dispatcher = dispatcher;
        this.reminders = reminders;
    }

    @Scheduled(fixedDelayString = "${app.jobs.dispatch-delay:PT15S}", initialDelayString = "PT20S")
    @SchedulerLock(name = "notifications.dispatch", lockAtMostFor = "PT5M")
    public void dispatch() {
        int sent = dispatcher.dispatchAll();
        if (sent > 0) {
            log.info("Sent {} notifications", sent);
        }
    }

    @Scheduled(fixedDelayString = "${app.jobs.reminder-delay:PT5M}", initialDelayString = "PT1M")
    @SchedulerLock(name = "notifications.reminders", lockAtMostFor = "PT10M")
    public void reminders() {
        int queued = reminders.queueDueReminders();
        if (queued > 0) {
            log.info("Queued {} reminders", queued);
        }
    }
}
