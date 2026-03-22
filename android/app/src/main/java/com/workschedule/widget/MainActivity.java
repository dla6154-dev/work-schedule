package com.workschedule.widget;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(CalendarBridgePlugin.class);
        super.onCreate(savedInstanceState);

        // 앱 시작 시 업데이트 체크 (백그라운드 실행, 실패해도 앱에 영향 없음)
        new AppUpdater(this).checkForUpdate();
    }
}
