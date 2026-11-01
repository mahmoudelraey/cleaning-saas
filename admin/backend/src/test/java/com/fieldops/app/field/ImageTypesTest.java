package com.fieldops.app.field;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ImageTypesTest {

    @Test
    void detectsRealImageSignatures() {
        assertThat(ImageTypes.detect(new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00}))
                .get().extracting(ImageTypes.Detected::contentType).isEqualTo("image/jpeg");
        assertThat(ImageTypes.detect(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}))
                .get().extracting(ImageTypes.Detected::extension).isEqualTo("png");
        assertThat(ImageTypes.detect("RIFF0000WEBPVP8 ".getBytes(StandardCharsets.US_ASCII))).isPresent();
        assertThat(ImageTypes.detect("0000ftypheic0000".getBytes(StandardCharsets.US_ASCII))).isPresent();
    }

    @Test
    void rejectsEverythingElse() {
        assertThat(ImageTypes.detect("<html><script>".getBytes(StandardCharsets.US_ASCII))).isEmpty();
        assertThat(ImageTypes.detect("%PDF-1.7".getBytes(StandardCharsets.US_ASCII))).isEmpty();
        assertThat(ImageTypes.detect(new byte[0])).isEmpty();
    }
}
