package com.fieldops.app.billing;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Background billing jobs. Disabled with {@code app.jobs.enabled=false} (tests call the service directly). */
@Component
@ConditionalOnProperty(name = "app.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class BillingJobs {

    private static final Logger log = LoggerFactory.getLogger(BillingJobs.class);

    private final AutoInvoiceService autoInvoices;

    public BillingJobs(AutoInvoiceService autoInvoices) {
        this.autoInvoices = autoInvoices;
    }

    @Scheduled(fixedDelayString = "${app.jobs.auto-invoice-delay:PT1M}", initialDelayString = "PT30S")
    @SchedulerLock(name = "billing.auto-invoice", lockAtMostFor = "PT10M")
    public void autoInvoices() {
        int issued = autoInvoices.processAll();
        if (issued > 0) {
            log.info("Issued {} automatic invoices", issued);
        }
    }
}
