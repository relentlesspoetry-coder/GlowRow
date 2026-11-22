package com.glowrow.app;

import java.util.regex.Pattern;

/** Restricts release metadata to stable versions and a fixed official destination. */
final class UpdateTrust {
    static final String REPO = "https://github.com/relentlesspoetry-coder/GlowRow";
    static final String LATEST = "https://api.github.com/repos/relentlesspoetry-coder/GlowRow/releases/latest";
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

    static String releaseUrl(String tag) {
        if (!stableTag(tag)) throw new IllegalArgumentException("Invalid version tag");
        return REPO + "/releases/tag/" + tag;
    }

    private UpdateTrust() {}
}
