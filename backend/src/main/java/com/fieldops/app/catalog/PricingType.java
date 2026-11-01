package com.fieldops.app.catalog;

public enum PricingType {
    /** One price per visit. */
    FIXED,
    /** base price × hours. */
    HOURLY,
    /** base price × square metres. */
    PER_SQM
}
