package com.workschedule.widget;

import android.content.Intent;
import android.widget.RemoteViewsService;

public class WorkScheduleGridService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new WorkScheduleGridFactory(getApplicationContext(), intent);
    }
}
