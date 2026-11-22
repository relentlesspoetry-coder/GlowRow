package com.glowrow.app;

import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Paths;

public final class UpdateTrustTest {
    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
    }
    public static void main(String[] args) throws Exception {
        check(UpdateTrust.compare("v1.10.0","v1.2.0")>0,"numeric version ordering");
        check(UpdateTrust.compare("v1.1.0","v1.1.0")==0,"equal release version");
        check(!UpdateTrust.stableTag("v1.1.0-rc.1") && !UpdateTrust.stableTag("v01.1.0"),"stable tags only");
        check(UpdateTrust.validSize(1) && UpdateTrust.validSize(UpdateTrust.MAX_APK),"size endpoints");
        check(!UpdateTrust.validSize(0) && !UpdateTrust.validSize(UpdateTrust.MAX_APK+1),"bounded downloads");
        check(UpdateTrust.allowedRedirect(new URL("https://release-assets.githubusercontent.com/assets")),"official CDN allowed");
        check(!UpdateTrust.allowedRedirect(new URL("http://release-assets.githubusercontent.com/assets")),"TLS required");
        check(!UpdateTrust.allowedRedirect(new URL("https://release-assets.githubusercontent.com.example.invalid/")),"unrelated host");
        check(!UpdateTrust.allowedRedirect(new URL("https://user@release-assets.githubusercontent.com/")),"no embedded credentials");
        check(!UpdateTrust.allowedRedirect(new URL("https://release-assets.githubusercontent.com:8080/")),"site default TLS only");
        check(!UpdateTrust.trustedSigner(new byte[]{1,2,3}),"untrusted key");
        check(UpdateTrust.trustedDigest("0000000000000000000000000000000000000000000000000000000000000000",new byte[32]),"correct digest");
        check(!UpdateTrust.trustedDigest(UpdateTrust.CERT_SHA256,new byte[32]),"wrong digest");
        if (args.length>0) {
            byte[][] pin={Files.readAllBytes(Paths.get(args[0]))};
            String name="com.glowrow.app";
            check(UpdateTrust.trustedMetadata(name,name,1,2,"1.1.0","v1.1.0",pin),"known signer and newer matching release");
            check(!UpdateTrust.trustedMetadata(name,name,2,1,"1.1.0","v1.1.0",pin),"reject downgrade");
            check(!UpdateTrust.trustedMetadata(name,name,2,2,"1.1.0","v1.1.0",pin),"reject same code");
            check(!UpdateTrust.trustedMetadata(name,"example.other",1,2,"1.1.0","v1.1.0",pin),"reject different package");
            check(!UpdateTrust.trustedMetadata(name,name,1,2,"1.2.0","v1.1.0",pin),"reject mismatched release metadata");
            check(!UpdateTrust.trustedMetadata(name,name,1,2,"1.1.0","v1.1.0",new byte[][]{pin[0],pin[0]}),"reject multiple signers");
        }
        System.out.println("GlowRow updater trust tests passed");
    }
}
