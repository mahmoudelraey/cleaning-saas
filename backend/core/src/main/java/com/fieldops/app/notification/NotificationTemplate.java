package com.fieldops.app.notification;

import java.util.List;

/**
 * Customer messages. {@link #arabicText} is what SMS and the send log show; WhatsApp sends an
 * approved template with the same parameters in the same order (create matching templates in Meta
 * Business Manager, language "ar", and map their names in {@code app.notifications.whatsapp.templates}).
 */
public enum NotificationTemplate {

    BOOKING_RECEIVED(List.of("customer", "company", "date", "time", "number"),
            "مرحباً {customer}، استلمت {company} طلبك رقم #{number} ليوم {date} الساعة {time}. سنؤكد الموعد قريباً."),

    BOOKING_CONFIRMED(List.of("customer", "company", "date", "time", "number"),
            "مرحباً {customer}، تم تأكيد موعدك مع {company} يوم {date} الساعة {time}. رقم الطلب #{number}."),

    BOOKING_RESCHEDULED(List.of("customer", "company", "date", "time", "number"),
            "مرحباً {customer}، تم تغيير موعد طلبك #{number} مع {company} إلى يوم {date} الساعة {time}."),

    BOOKING_REMINDER(List.of("customer", "company", "date", "time", "number"),
            "تذكير: موعدك مع {company} يوم {date} الساعة {time}. رقم الطلب #{number}."),

    TECHNICIAN_ON_THE_WAY(List.of("customer", "technician", "company", "number"),
            "مرحباً {customer}، الفني {technician} من {company} في الطريق إليك الآن (طلب #{number})."),

    VISIT_COMPLETED(List.of("customer", "company", "number"),
            "شكراً {customer}! اكتملت زيارة {company} (طلب #{number}). يسعدنا خدمتك دائماً."),

    BOOKING_CANCELLED(List.of("customer", "company", "number"),
            "مرحباً {customer}، تم إلغاء طلبك #{number} لدى {company}."),

    INVOICE_ISSUED(List.of("customer", "company", "number", "total", "link"),
            "مرحباً {customer}، فاتورة {company} رقم {number} بمبلغ {total} ر.س: {link}"),

    QUOTE_SENT(List.of("customer", "company", "number", "total", "link"),
            "مرحباً {customer}، عرض سعر من {company} رقم {number} بمبلغ {total} ر.س. للاطلاع والموافقة: {link}"),

    /** Free text written by the office on the booking page (one line; WhatsApp template params can't hold newlines). */
    CUSTOM_MESSAGE(List.of("customer", "company", "message"),
            "مرحباً {customer}، رسالة من {company}: {message}"),

    OTP(List.of("code", "company"),
            "رمز التحقق لحجزك لدى {company}: {code}. لا تشاركه مع أحد.");

    private final List<String> params;
    private final String arabicText;

    NotificationTemplate(List<String> params, String arabicText) {
        this.params = params;
        this.arabicText = arabicText;
    }

    public List<String> params() {
        return params;
    }

    /** Renders the text with values in {@link #params()} order. */
    public String render(List<String> values) {
        String text = arabicText;
        for (int i = 0; i < params.size(); i++) {
            String value = i < values.size() && values.get(i) != null ? values.get(i) : "";
            text = text.replace("{" + params.get(i) + "}", value);
        }
        return text;
    }
}
