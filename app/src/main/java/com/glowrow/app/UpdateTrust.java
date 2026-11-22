package com.glowrow.app;

import java.net.URL;
import java.security.MessageDigest;
import java.util.regex.Pattern;

final class UpdateTrust {
    static final String REPO = "https://github.com/relentlesspoetry-coder/GlowRow";
    static final String LATEST = "https://api.github.com/repos/relentlesspoetry-coder/GlowRow/releases/latest";
    static final String APK = "GlowRow.apk";
    static final long MAX_APK = 16L * 1024 * 1024;
    static final String CERT_SHA256 = "6710a07a03e81d54327e1def0753257d29abd1691b0a485b9688891af52da10f";
    private static final Pattern TAG = Pattern.compile("v(0|[1-9][0-9]{0,3})\\.(0|[1-9][0-9]{0,3})\\.(0|[1-9][0-9]{0,3})");

    static boolean stableTag(String tag) { return tag != null && TAG.matcher(tag).matches(); }

    static int compare(String a, String b) {
        if (!stableTag(a) || !stableTag(b)) throw new IllegalArgumentException("Invalid version tag");
        String[] av = a.substring(1).split("\\."), bv = b.substring(1).split("\\.");
        for (int i=0; i<3; i++) {
            int diff = Integer.parseInt(av[i]) - Integer.parseInt(bv[i]);
            if (diff != 0) return diff;
        }
        return 0;
    }

    static String assetUrl(String tag) {
        if (!stableTag(tag)) throw new IllegalArgumentException("Invalid version tag");
        return REPO + "/releases/download/" + tag + "/" + APK;
    }

    static boolean allowedRedirect(URL url) {
        String host = url.getHost();
        return "https".equals(url.getProtocol()) && url.getUserInfo() == null
                && (url.getPort() == -1 || url.getPort() == 443)
                && ("release-assets.githubusercontent.com".equals(host)
                    || "objects.githubusercontent.com".equals(host));
    }

    static boolean trustedMetadata(String currentPackage, String candidatePackage, long installedCode,
            long candidateCode, String candidateVersion, String releaseTag, byte[][] signers) throws Exception {
        return currentPackage.equals(candidatePackage) && candidateCode > installedCode
                && releaseTag.equals("v" + candidateVersion) && signers != null && signers.length == 1
                && trustedSigner(signers[0]);
    }

    static boolean trustedSigner(byte[] signature) throws Exception {
        if (signature == null) return false;
        return trustedDigest(CERT_SHA256, MessageDigest.getInstance("SHA-256").digest(signature));
    }

    static boolean validDigest(String digest) {
        return digest != null && digest.matches("[0-9a-f]{64}");
    }

    static boolean trustedDigest(String hex, byte[] digest) {
        if (!validDigest(hex) || digest == null) return false;
        byte[] expected = new byte[32];
        for (int i=0; i<expected.length; i++)
            expected[i] = (byte) Integer.parseInt(hex.substring(i*2, i*2+2), 16);
        return MessageDigest.isEqual(expected, digest);
    }

    static boolean validSize(long size) { return size > 0 && size <= MAX_APK; }

    private UpdateTrust() {}
}
