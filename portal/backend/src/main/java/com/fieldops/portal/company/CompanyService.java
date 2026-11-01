package com.fieldops.portal.company;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.fieldops.portal.admin.AdminClient;
import com.fieldops.portal.admin.AdminDtos.Company;
import com.fieldops.portal.config.PortalProperties;
import org.springframework.stereotype.Service;

/** Company card for a portal link, cached for a minute (it is read on every page). */
@Service
public class CompanyService {

    private static final Duration TTL = Duration.ofSeconds(60);

    private final AdminClient admin;
    private final String adminPublicUrl;
    private final Map<String, Entry> cache = new ConcurrentHashMap<>();

    public CompanyService(AdminClient admin, PortalProperties props) {
        this.admin = admin;
        String url = props.admin().publicUrl();
        this.adminPublicUrl = url == null ? "" : url.replaceAll("/+$", "");
    }

    private record Entry(Company company, Instant until) {
    }

    public Company get(String slug) {
        String key = slug.toLowerCase();
        Entry e = cache.get(key);
        Instant now = Instant.now();
        if (e == null || now.isAfter(e.until())) {
            Company c = admin.get(slug, "", Company.class);
            // Logos are served by the admin backend's public endpoint; make the path absolute for the browser.
            if (c != null && c.logoUrl() != null && c.logoUrl().startsWith("/")) {
                c = new Company(c.tenantId(), c.name(), c.slug(), adminPublicUrl + c.logoUrl(), c.phone(), c.timezone(),
                        c.bookingOpen(), c.vatRegistered(), c.pricesIncludeVat(), c.maxDaysAhead(), c.leadTimeHours(),
                        c.cancelNoticeHours());
            }
            e = new Entry(c, now.plus(TTL));
            cache.put(key, e);
        }
        return e.company();
    }
}
