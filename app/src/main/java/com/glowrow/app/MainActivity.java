package com.glowrow.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final int PICK_PATTERN = 41;
    // A stable private origin gives DOM storage a fixed identity. The WebView
    // cannot reach the network; native GitHub traffic requires an update tap.
    private static final String ORIGIN = "https://glowrow.invalid/";
    private static final String CHECK_UPDATE = ORIGIN + "native/check-for-updates";
    private ValueCallback<Uri[]> pickerCallback;
    private WebView viewer;
    private Updates updates;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        updates = new Updates(this);
        viewer = new WebView(this);
        viewer.setBackgroundColor(0xFF0D141E);
        setContentView(viewer);
        viewer.getSettings().setJavaScriptEnabled(true);
        viewer.getSettings().setDomStorageEnabled(true);
        viewer.getSettings().setAllowFileAccess(false);
        viewer.getSettings().setAllowContentAccess(true); // Android's selected document URI only.
        viewer.getSettings().setBlockNetworkLoads(true);
        viewer.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame() && request.hasGesture()
                        && ORIGIN.equals(view.getUrl()) && CHECK_UPDATE.equals(request.getUrl().toString()))
                    updates.check();
                return true;
            }
        });
        viewer.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (pickerCallback != null) pickerCallback.onReceiveValue(null);
                pickerCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
                try {
                    startActivityForResult(picker, PICK_PATTERN);
                } catch (ActivityNotFoundException first) {
                    try {
                        startActivityForResult(new Intent(Intent.ACTION_GET_CONTENT)
                                .addCategory(Intent.CATEGORY_OPENABLE).setType("image/*"), PICK_PATTERN);
                    } catch (ActivityNotFoundException unavailable) {
                        finishPicker(null);
                        Toast.makeText(MainActivity.this, "No image picker is available.", Toast.LENGTH_LONG).show();
                    }
                }
                return true;
            }
        });
        try (InputStream source = getAssets().open("index.html")) {
            ByteArrayOutputStream data = new ByteArrayOutputStream();
            byte[] block = new byte[8192];
            for (int n; (n = source.read(block)) != -1;) data.write(block, 0, n);
            viewer.loadDataWithBaseURL(ORIGIN, data.toString(StandardCharsets.UTF_8.name()),
                    "text/html", "UTF-8", ORIGIN);
        } catch (IOException missing) {
            Toast.makeText(this, "GlowRow could not open its viewer.", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private void finishPicker(Uri image) {
        ValueCallback<Uri[]> callback = pickerCallback;
        pickerCallback = null;
        if (callback != null) callback.onReceiveValue(image == null ? null : new Uri[] { image });
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_PATTERN) {
            Uri image = result == RESULT_OK && data != null ? data.getData() : null;
            finishPicker(image != null && "content".equals(image.getScheme()) ? image : null);
        }
    }

    @Override public void onBackPressed() {
        viewer.evaluateJavascript("window.glowRowBack ? window.glowRowBack() : false",
                new ValueCallback<String>() {
                    @Override public void onReceiveValue(String handled) {
                        if (!"true".equals(handled)) finish();
                    }
                });
    }

    @Override protected void onDestroy() {
        finishPicker(null);
        if (viewer != null) {
            setContentView(new android.widget.FrameLayout(this));
            viewer.destroy();
        }
        super.onDestroy();
    }
}
