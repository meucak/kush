package com.kush.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.DownloadListener;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends Activity {

    private static final String TAG = "kush";
    private WebView mWebView;
    private ValueCallback<Uri[]> mFilePathCallback;
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final String PREFS_NAME = "KushPrefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String DEFAULT_SERVER_URL = "http://192.168.1.27:8088";

    // Ranked candidate endpoints
    private static final String[] CANDIDATE_URLS = new String[]{
        "http://192.168.1.27:8088",   // Toshi Wi-Fi relay (fastest on home Wi-Fi)
        "http://100.69.155.110:8088",  // Kasa direct Tailscale IP
        "http://192.168.1.102:8088"   // Kasa Ethernet direct
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d(TAG, "onCreate initiated");

        mWebView = new WebView(this);
        mWebView.clearCache(true);
        setContentView(mWebView);

        setupWebView();
        discoverAndConnect(false);
    }

    private void setupWebView() {
        WebView.setWebContentsDebuggingEnabled(true);
        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        // Modern User Agent
        String defaultUa = settings.getUserAgentString();
        settings.setUserAgentString(defaultUa + " KushNative/1.0");

        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 2001);
        }

        mWebView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                downloadFileNative(url, contentDisposition, mimeType);
            }
        });

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.endsWith(".apk") || url.contains("/download/") || url.contains("/api/files/")) {
                    downloadFileNative(url, null, null);
                    return true;
                }
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false; // let webview load LAN links
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return true;
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    Log.w(TAG, "Main frame failed to load: " + error.getDescription());
                    discoverAndConnect(true);
                }
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                request.grant(request.getResources());
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(TAG, "[Console] " + consoleMessage.message() + " (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")");
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                            FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) {
                    mFilePathCallback.onReceiveValue(null);
                }
                mFilePathCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
                } catch (Exception e) {
                    mFilePathCallback = null;
                    Toast.makeText(MainActivity.this, "Dosya yöneticisi açılamadı.", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });
    }

    private void discoverAndConnect(final boolean forcePromptOnFail) {
        Log.d(TAG, "Starting parallel candidate probe...");
        final AtomicBoolean found = new AtomicBoolean(false);

        for (final String candidate : CANDIDATE_URLS) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        URL u = new URL(candidate + "/api/info");
                        HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                        conn.setConnectTimeout(1200);
                        conn.setReadTimeout(1200);
                        conn.setRequestMethod("GET");
                        int code = conn.getResponseCode();
                        conn.disconnect();
                        Log.d(TAG, "Candidate " + candidate + " HTTP code: " + code);

                        if (code == 200 && found.compareAndSet(false, true)) {
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    Log.i(TAG, "Successfully connected to: " + candidate);
                                    SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                                    prefs.edit().putString(KEY_SERVER_URL, candidate).apply();
                                    mWebView.loadUrl(candidate);
                                }
                            });
                        }
                    } catch (Exception e) {
                        Log.d(TAG, "Candidate " + candidate + " error: " + e.getMessage());
                    }
                }
            }).start();
        }

        // Safety fallback timer if none responded after 2.5 seconds
        mWebView.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!found.get()) {
                    if (forcePromptOnFail) {
                        showServerConfigDialog("Sunucuya otomatik bağlanılamadı. Lütfen sunucu IP adresini girin:");
                    } else {
                        // Try default
                        mWebView.loadUrl(DEFAULT_SERVER_URL);
                    }
                }
            }
        }, 2500);
    }

    private void showServerConfigDialog(String promptMessage) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String currentUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);

        final EditText input = new EditText(this);
        input.setText(currentUrl);
        input.setSelection(input.getText().length());

        new AlertDialog.Builder(this)
            .setTitle("kush Sunucu Ayarı")
            .setMessage(promptMessage)
            .setView(input)
            .setPositiveButton("Bağlan", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    String newUrl = input.getText().toString().trim();
                    if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
                        newUrl = "http://" + newUrl;
                    }
                    prefs.edit().putString(KEY_SERVER_URL, newUrl).apply();
                    mWebView.loadUrl(newUrl);
                }
            })
            .setNegativeButton("İptal", null)
            .setNeutralButton("Yeniden Tara", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    discoverAndConnect(true);
                }
            })
            .show();
    }

    private void downloadFileNative(String url, String contentDisposition, String mimeType) {
        try {
            Uri uri = Uri.parse(url);
            String fileName = null;

            try {
                fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            } catch (Exception ignored) {}

            if (fileName == null || fileName.isEmpty() || fileName.equals("downloadfile")) {
                String path = uri.getPath();
                if (path != null && path.contains("/")) {
                    String lastSegment = path.substring(path.lastIndexOf('/') + 1);
                    if (lastSegment.contains("_")) {
                        fileName = lastSegment.substring(lastSegment.indexOf('_') + 1);
                    } else {
                        fileName = lastSegment;
                    }
                }
            }
            if (fileName == null || fileName.isEmpty()) {
                fileName = "kush_indirilen_dosya";
            }

            DownloadManager.Request request = new DownloadManager.Request(uri);
            if (mimeType != null && !mimeType.isEmpty()) {
                request.setMimeType(mimeType);
            }
            request.setTitle(fileName);
            request.setDescription("kush ile doğrudan indiriliyor");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);

            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(request);
                Toast.makeText(this, fileName + " İndirilenler klasörüne kaydediliyor...", Toast.LENGTH_SHORT).show();
                return;
            }
        } catch (Exception e) {
            Log.e(TAG, "Native download error, falling back", e);
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (Exception ex) {
            Toast.makeText(this, "İndirme başlatılamadı: " + ex.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (mFilePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                } else if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (mWebView.canGoBack()) {
                mWebView.goBack();
                return true;
            } else {
                showServerConfigDialog("Sunucu adresini değiştirmek veya yeniden taranmasını ister misiniz?");
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}
