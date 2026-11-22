package com.glowrow.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

final class Updates {
    private final Activity activity;
    private boolean busy;
    private static final int MAX_RESPONSE = 524288;

    Updates(Activity activity) { this.activity=activity; }

    void check() {
        if (busy) return;
        busy=true;
        final AlertDialog progress=new AlertDialog.Builder(activity)
                .setMessage("Checking GitHub for a GlowRow update…").setNegativeButton("Cancel",null).show();
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    String version=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionName;
                    final String next=latest("v"+version);
                    done(progress, new Runnable() {
                        @Override public void run() {
                            if (next==null) {
                                message("Up to date", "You’re using the latest GlowRow release.");
                                return;
                            }
                            new AlertDialog.Builder(activity).setTitle("GlowRow "+next.substring(1)+" is available")
                                .setMessage("Open the official release on GitHub in your browser? GlowRow doesn’t download or install apps.")
                                .setNegativeButton("Not now",null)
                                .setPositiveButton("Open GitHub",new DialogInterface.OnClickListener() {
                                    @Override public void onClick(DialogInterface dialog,int which) { openRelease(next); }
                                }).show();
                        }
                    });
                } catch (Exception problem) {
                    done(progress, new Runnable() {
                        @Override public void run() {
                            if (problem instanceof RateLimit)
                                message("GitHub is limiting checks", "Wait a little and try again. GlowRow works offline.");
                            else
                                message("Could not check for updates", "Check your connection and try again. GlowRow works offline.");
                        }
                    });
                }
            }
        },"glowrow-update-check").start();
    }

    private void openRelease(String tag) {
        try {
            Intent browser=new Intent(Intent.ACTION_VIEW,Uri.parse(UpdateTrust.releaseUrl(tag)));
            browser.addCategory(Intent.CATEGORY_BROWSABLE);
            activity.startActivity(browser);
        } catch (ActivityNotFoundException | SecurityException unavailable) {
            message("Could not open GitHub", "Open the GlowRow repository’s Releases page from your browser.");
        }
    }

    private static String latest(String currentTag) throws Exception {
        HttpURLConnection conn=(HttpURLConnection)new URL(UpdateTrust.LATEST).openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        conn.setRequestProperty("User-Agent","GlowRow/1.1");
        conn.setRequestProperty("Accept","application/vnd.github+json");
        conn.setRequestProperty("Accept-Encoding","identity");
        try {
            int status=conn.getResponseCode();
            if (status==403 || status==429) throw new RateLimit();
            if (status!=200) throw new IOException("Could not read release metadata.");
            try (InputStream in=conn.getInputStream(); ByteArrayOutputStream out=new ByteArrayOutputStream()) {
                long deadline=SystemClock.elapsedRealtime()+15000;
                byte[] buffer=new byte[8192];
                for (int n;(n=in.read(buffer))!=-1;) {
                    if (out.size()+n>MAX_RESPONSE || SystemClock.elapsedRealtime()>deadline)
                        throw new IOException("Release metadata exceeded limits.");
                    out.write(buffer,0,n);
                }
                JSONObject json=new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
                String tag=json.optString("tag_name");
                if (!UpdateTrust.stableTag(tag) || json.optBoolean("draft") || json.optBoolean("prerelease"))
                    throw new IOException("No compatible stable release.");
                return UpdateTrust.compare(tag,currentTag)>0 ? tag : null;
            }
        } finally { conn.disconnect(); }
    }

    private void done(final AlertDialog progress, final Runnable result) {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() {
                busy=false;
                if (!activity.isFinishing() && !activity.isDestroyed() && progress.isShowing()) {
                    progress.dismiss();
                    result.run();
                }
            }
        });
    }

    private void message(String title,String text) {
        new AlertDialog.Builder(activity).setTitle(title).setMessage(text).setPositiveButton("OK",null).show();
    }

    private static final class RateLimit extends IOException {}
}
