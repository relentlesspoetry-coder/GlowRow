package com.glowrow.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

final class Updates {
    static final int ENABLE_INSTALL = 42;
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private final Activity activity;
    private boolean busy;
    private Release pending;
    private static final class Release {
        final String tag;
        final long size;
        final String digest;
        Release(String tag, long size, String digest) { this.tag=tag; this.size=size; this.digest=digest; }
    }

    Updates(Activity activity) { this.activity=activity; }

    void check() {
        if (busy || pending != null) return;
        busy = true;
        final AlertDialog progress = progress("Checking GitHub for a GlowRow update…");
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    PackageInfo current = installed();
                    byte[][] currentSigners=signers(current);
                    if (currentSigners==null || !UpdateTrust.trustedSigner(currentSigners[0]))
                        throw new SecurityException("Installed app is not signed by the release key.");
                    final Release release = latest("v" + current.versionName);
                    done(progress, new Runnable() {
                        @Override public void run() {
                            if (release == null) {
                                message("Up to date", "You’re using the latest GlowRow release.");
                            } else {
                                new AlertDialog.Builder(activity).setTitle("GlowRow " + release.tag.substring(1) + " is available")
                                    .setMessage("Download the update from GitHub? Android will ask before installing it. Your patterns and row progress stay on this device.")
                                    .setNegativeButton("Not now", null)
                                    .setPositiveButton("Download update", new android.content.DialogInterface.OnClickListener() {
                                        @Override public void onClick(android.content.DialogInterface dialog, int which) { download(release); }
                                    })
                                    .show();
                            }
                        }
                    });
                } catch (Exception problem) {
                    showFailure(progress, problem);
                }
            }
        }, "glowrow-update-check").start();
    }

    private void download(final Release release) {
        if (busy) return;
        busy = true;
        final AlertDialog progress = progress("Downloading and verifying GlowRow…");
        new Thread(new Runnable() {
            @Override public void run() {
                File temporary = null;
                try {
                    temporary = File.createTempFile("glowrow-update-", ".apk", activity.getCacheDir());
                    HttpURLConnection connection = open(UpdateTrust.assetUrl(release.tag), true);
                    try {
                        long length = connection.getContentLengthLong();
                        if (length != -1 && length != release.size) throw new IOException("Update size does not match.");
                        try (InputStream in=connection.getInputStream(); FileOutputStream out=new FileOutputStream(temporary)) {
                            if (copy(in, out, release.size, 60000) != release.size)
                                throw new IOException("Incomplete update.");
                            out.getFD().sync();
                        }
                    } finally { connection.disconnect(); }
                    verify(temporary, release);
                    File verified = UpdateFileProvider.file(activity);
                    activity.revokeUriPermission(UpdateFileProvider.uri(activity.getPackageName()), Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    if (!temporary.renameTo(verified)) throw new IOException("Could not save verified update.");
                    done(progress, new Runnable() {
                        @Override public void run() { requestInstall(release); }
                    });
                } catch (Exception problem) {
                    showFailure(progress, problem);
                } finally { if (temporary != null) temporary.delete(); }
            }
        }, "glowrow-update-download").start();
    }

    private void requestInstall(Release release) {
        if (activity.getPackageManager().canRequestPackageInstalls()) {
            finishInstall(release);
            return;
        }
        new AlertDialog.Builder(activity).setTitle("Allow GlowRow updates")
            .setMessage("Android requires permission for GlowRow to open an update in the installer. If you allow it, return to GlowRow to review Android’s installation prompt.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Open Android settings", new android.content.DialogInterface.OnClickListener() {
                @Override public void onClick(android.content.DialogInterface dialog, int which) {
                pending = release;
                try {
                    activity.startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName())), ENABLE_INSTALL);
                } catch (ActivityNotFoundException | SecurityException e) {
                    pending = null;
                    message("Could not open settings", "Open your tablet’s installation settings for GlowRow, or download the APK from GitHub.");
                }
                }
            }).show();
    }

    void returnedFromSettings() {
        Release release = pending;
        pending = null;
        if (release == null) return;
        if (activity.getPackageManager().canRequestPackageInstalls()) finishInstall(release);
        else message("Update not installed", "Android did not grant GlowRow installation permission.");
    }

    private void finishInstall(final Release release) {
        if (busy) return;
        busy = true;
        final AlertDialog progress = progress("Preparing Android’s installer…");
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    verify(UpdateFileProvider.file(activity), release);
                    done(progress, new Runnable() {
                        @Override public void run() {
                            try {
                                Uri apk=UpdateFileProvider.uri(activity.getPackageName());
                                Intent install=new Intent(Intent.ACTION_VIEW).setDataAndType(apk, APK_MIME)
                                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                install.setClipData(ClipData.newRawUri(UpdateTrust.APK, apk));
                                activity.startActivity(install);
                            } catch (ActivityNotFoundException | SecurityException issue) {
                                message("Android could not open the installer", "Download GlowRow.apk from GitHub and open it from the tablet’s Downloads folder.");
                            }
                        }
                    });
                } catch (Exception issue) { showFailure(progress, issue); }
            }
        }, "glowrow-update-verify").start();
    }

    private void verify(File file, Release release) throws Exception {
        if (!file.isFile() || file.length() != release.size || !UpdateTrust.validSize(file.length()))
            throw new IOException("Invalid update size.");
        if (release.digest!=null) {
            MessageDigest sha=MessageDigest.getInstance("SHA-256");
            try (InputStream in=new FileInputStream(file)) {
                byte[] block=new byte[8192];
                for (int n; (n=in.read(block))!=-1;) sha.update(block,0,n);
            }
            if (!UpdateTrust.trustedDigest(release.digest,sha.digest()))
                throw new SecurityException("The checksum does not match GitHub’s release.");
        }
        PackageInfo current=installed();
        PackageInfo candidate=activity.getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), signingFlag());
        byte[][] localSigners=signers(current);
        if (candidate==null || localSigners==null || !UpdateTrust.trustedSigner(localSigners[0])
                || !UpdateTrust.trustedMetadata(activity.getPackageName(), candidate.packageName,
                code(current), code(candidate), candidate.versionName, release.tag, signers(candidate)))
            throw new SecurityException("Package or signing certificate did not match.");
    }

    private static int signingFlag() {
        return Build.VERSION.SDK_INT>=28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }
    private static byte[][] signers(PackageInfo info) {
        Signature[] signatures=Build.VERSION.SDK_INT>=28 ?
            (info.signingInfo==null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
        return signatures != null && signatures.length == 1 && signatures[0] != null
            ? new byte[][] {signatures[0].toByteArray()} : null;
    }
    private PackageInfo installed() throws PackageManager.NameNotFoundException {
        return activity.getPackageManager().getPackageInfo(activity.getPackageName(), signingFlag());
    }
    private static long code(PackageInfo info) {
        return Build.VERSION.SDK_INT>=28 ? info.getLongVersionCode() : info.versionCode;
    }

    private static Release latest(String currentTag) throws Exception {
        HttpURLConnection connection=open(UpdateTrust.LATEST, false);
        JSONObject response;
        try (InputStream in=connection.getInputStream(); ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            copy(in,out,524288,20000);
            response=new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
        } finally { connection.disconnect(); }
        String tag=response.optString("tag_name");
        if (!UpdateTrust.stableTag(tag) || response.optBoolean("draft") || response.optBoolean("prerelease"))
            throw new IOException("No compatible stable release found.");
        if (UpdateTrust.compare(tag,currentTag)<=0) return null;
        JSONArray assets=response.getJSONArray("assets");
        Release result=null;
        for (int i=0;i<assets.length();i++) {
            JSONObject asset=assets.getJSONObject(i);
            if (!UpdateTrust.APK.equals(asset.optString("name"))) continue;
            long size=asset.optLong("size",-1);
            if (result != null || !UpdateTrust.validSize(size)
                    || !UpdateTrust.assetUrl(tag).equals(asset.optString("browser_download_url")))
                throw new IOException("Invalid GitHub release metadata.");
            String digest=asset.isNull("digest") ? null : asset.getString("digest");
            if (digest!=null) {
                if (!digest.startsWith("sha256:") || !UpdateTrust.validDigest(digest.substring(7)))
                    throw new IOException("Invalid GitHub release checksum.");
                digest=digest.substring(7);
            }
            result=new Release(tag,size,digest);
        }
        if (result==null) throw new IOException("Update APK has not been attached yet.");
        return result;
    }

    private static final class RateLimit extends IOException {}
    private static HttpURLConnection open(String initial, boolean download) throws IOException {
        URL url=new URL(initial);
        for(int redirects=0;redirects<4;redirects++) {
            HttpURLConnection connection=(HttpURLConnection)url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setRequestProperty("User-Agent", "GlowRow/1.1");
            connection.setRequestProperty("Accept", download ? "application/octet-stream" : "application/vnd.github+json");
            connection.setRequestProperty("Accept-Encoding", "identity");
            try {
                int status=connection.getResponseCode();
                if (status==200) return connection;
                if (status==403 || status==429) throw new RateLimit();
                if (!download || (status!=301 && status!=302 && status!=303 && status!=307 && status!=308))
                    throw new IOException("GitHub responded with HTTP " + status);
                String location=connection.getHeaderField("Location");
                if (location==null) throw new IOException("Missing redirect.");
                url=new URL(url,location);
                if (!UpdateTrust.allowedRedirect(url)) throw new IOException("Unexpected download host.");
            } catch (IOException | RuntimeException problem) {
                connection.disconnect();
                throw problem;
            }
            connection.disconnect();
        }
        throw new IOException("Too many download redirects.");
    }

    private static long copy(InputStream in, java.io.OutputStream out, long limit, long timeout) throws IOException {
        long deadline=SystemClock.elapsedRealtime()+timeout;
        byte[] buffer=new byte[8192]; long count=0;
        for (int n; (n=in.read(buffer))!=-1;) {
            count+=n;
            if (count>limit || SystemClock.elapsedRealtime()>deadline)
                throw new IOException("Download exceeded safe limits.");
            out.write(buffer,0,n);
        }
        return count;
    }

    private AlertDialog progress(String text) {
        return new AlertDialog.Builder(activity).setMessage(text).setNegativeButton("Cancel",null).show();
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

    private void showFailure(AlertDialog progress, final Exception problem) {
        done(progress, new Runnable() {
            @Override public void run() {
                if (problem instanceof RateLimit) {
                    message("GitHub is limiting checks", "Wait a little and try again. You can still use your patterns offline.");
                } else if (problem instanceof SecurityException) {
                    message("Update could not be verified", "GlowRow did not open Android’s installer. Try again later or check the official GitHub release.");
                } else {
                    message("Could not check for or download the update", "Check your internet connection and try again. If it still fails, check the GitHub Releases page.");
                }
            }
        });
    }

    private void message(String title, String text) {
        new AlertDialog.Builder(activity).setTitle(title).setMessage(text).setPositiveButton("OK",null).show();
    }
}
