package com.glowrow.app;

public final class UpdateTrustTest {
    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
    }

    public static void main(String[] args) {
        check(UpdateTrust.compare("v1.10.0","v1.2.0")>0,"numeric version ordering");
        check(UpdateTrust.compare("v1.1.1","v1.1.1")==0,"equal version");
        check(UpdateTrust.compare("v1.0.0","v1.1.1")<0,"older version");
        check(UpdateTrust.releaseUrl("v1.1.1").equals(
            "https://github.com/relentlesspoetry-coder/GlowRow/releases/tag/v1.1.1"),"official release only");
        for (String invalid : new String[]{null,"v1.1.0-rc.1","v01.1.0","v1.1.1/../../x",
                "https://example.invalid/x","v1.1.1?x=y","v1.1.1#x","v1.1.1\n","1.1.1"}) {
            check(!UpdateTrust.stableTag(invalid),"invalid stable tag");
            boolean rejected=false;
            try { UpdateTrust.releaseUrl(invalid); }
            catch (IllegalArgumentException expected) { rejected=true; }
            check(rejected,"invalid release URL rejected");
        }
        System.out.println("GlowRow updater version and fixed release URL tests passed");
    }
}
