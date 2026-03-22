package com.workschedule.widget;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 앱 자동 업데이트 체크 유틸리티.
 *
 * 서버에 version.json을 올려두면 앱 실행 시 버전을 비교하여
 * 새 버전이 있을 경우 업데이트 팝업을 표시합니다.
 *
 * ─── 서버에 올릴 version.json 형식 ───────────────────────
 * {
 *   "versionCode": 2,
 *   "versionName": "1.1.0",
 *   "apkUrl": "https://your-server.com/workschedule-latest.apk",
 *   "changelog": "공휴일 빨간색 표시, 오늘 날짜 동그라미 스타일 개선",
 *   "forceUpdate": false
 * }
 *
 * ─── VERSION_CHECK_URL을 실제 서버 주소로 변경하세요 ──────
 */
public class AppUpdater {

    private static final String VERSION_CHECK_URL =
            "https://fnpsaypaxpxyyqmrqwai.supabase.co/storage/v1/object/public/app-releases/version.json";

    private final Activity activity;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private long downloadId = -1;
    private BroadcastReceiver downloadReceiver;

    public AppUpdater(Activity activity) {
        this.activity = activity;
    }

    /** 앱 시작 시 호출. 백그라운드에서 버전 체크 후 필요 시 팝업 표시 */
    public void checkForUpdate() {
        new Thread(() -> {
            try {
                String json = fetchUrl(VERSION_CHECK_URL);
                if (json == null || json.isEmpty()) return;

                JSONObject obj = new JSONObject(json);
                int latestCode    = obj.optInt("versionCode", 0);
                String latestName = obj.optString("versionName", "");
                String apkUrl     = obj.optString("apkUrl", "");
                String changelog  = obj.optString("changelog", "");
                boolean force     = obj.optBoolean("forceUpdate", false);

                int currentCode = getCurrentVersionCode();

                if (latestCode > currentCode && !apkUrl.isEmpty()) {
                    mainHandler.post(() ->
                            showUpdateDialog(latestName, apkUrl, changelog, force));
                }
            } catch (Exception ignored) {
                // 네트워크 오류 등은 조용히 무시
            }
        }).start();
    }

    // ─── 업데이트 팝업 ──────────────────────────────────────

    private void showUpdateDialog(String version, String apkUrl,
                                  String changelog, boolean force) {
        if (activity.isFinishing() || activity.isDestroyed()) return;

        String message = "새 버전 " + version + "이 출시되었습니다.";
        if (!changelog.isEmpty()) {
            message += "\n\n📋 업데이트 내용\n" + changelog;
        }

        AlertDialog.Builder builder = new AlertDialog.Builder(activity)
                .setTitle("🔄 업데이트 알림")
                .setMessage(message)
                .setCancelable(!force)
                .setPositiveButton("지금 업데이트", (d, w) -> downloadAndInstall(apkUrl));

        if (!force) {
            builder.setNegativeButton("나중에", null);
        }

        builder.show();
    }

    // ─── 다운로드 ────────────────────────────────────────────

    private void downloadAndInstall(String apkUrl) {
        DownloadManager dm = (DownloadManager)
                activity.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) return;

        // 이전 다운로드 파일 제거
        try {
            java.io.File oldApk = new java.io.File(
                    activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    "workschedule-update.apk");
            if (oldApk.exists()) oldApk.delete();
        } catch (Exception ignored) {}

        Uri uri = Uri.parse(apkUrl);
        DownloadManager.Request request = new DownloadManager.Request(uri)
                .setTitle("근무표 업데이트 다운로드 중...")
                .setDescription("잠시 기다려 주세요")
                .setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(
                        activity, Environment.DIRECTORY_DOWNLOADS, "workschedule-update.apk")
                .setMimeType("application/vnd.android.package-archive");

        downloadId = dm.enqueue(request);

        // 다운로드 완료 시 설치 트리거
        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id == downloadId) {
                    installDownloadedApk(dm, id);
                    try {
                        activity.unregisterReceiver(this);
                    } catch (Exception ignored) {}
                }
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            activity.registerReceiver(downloadReceiver, filter);
        }
    }

    // ─── 설치 ─────────────────────────────────────────────────

    private void installDownloadedApk(DownloadManager dm, long id) {
        // Android 8+ 알 수 없는 앱 설치 권한 확인
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            if (!activity.getPackageManager().canRequestPackageInstalls()) {
                // 설정 화면으로 이동하여 권한 요청
                new AlertDialog.Builder(activity)
                        .setTitle("설치 권한 필요")
                        .setMessage("앱을 업데이트하려면 '알 수 없는 앱 설치' 권한이 필요합니다.\n설정에서 허용해 주세요.")
                        .setPositiveButton("설정으로 이동", (d, w) -> {
                            Intent intent = new Intent(
                                    android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + activity.getPackageName()));
                            activity.startActivity(intent);
                        })
                        .setNegativeButton("취소", null)
                        .show();
                return;
            }
        }

        Uri apkUri = dm.getUriForDownloadedFile(id);
        if (apkUri == null) return;

        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(apkUri, "application/vnd.android.package-archive");
        install.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        activity.startActivity(install);
    }

    // ─── 유틸 ─────────────────────────────────────────────────

    private int getCurrentVersionCode() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                return (int) activity.getPackageManager()
                        .getPackageInfo(activity.getPackageName(), 0).getLongVersionCode();
            } else {
                return activity.getPackageManager()
                        .getPackageInfo(activity.getPackageName(), 0).versionCode;
            }
        } catch (PackageManager.NameNotFoundException e) {
            return 0;
        }
    }

    private String fetchUrl(String urlString) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlString);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Cache-Control", "no-cache");

            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) return null;

            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
