package com.fieldops.portal.booking;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BookingQueriesTest {

    @Test
    void customersSeeTechniciansByFirstNameOnly() {
        assertThat(BookingQueries.firstName("محمود الراعي")).isEqualTo("محمود");
        assertThat(BookingQueries.firstName("Yousef")).isEqualTo("Yousef");
        assertThat(BookingQueries.firstName(null)).isNull();
    }
}
