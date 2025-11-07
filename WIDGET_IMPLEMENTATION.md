# Android Widget Implementation Guide

## Current Limitation
PWAs (Progressive Web Apps) **cannot directly create Android home screen widgets**. This requires native Android development.

## Solution: Convert to TWA (Trusted Web Activity)

### What is TWA?
A Trusted Web Activity is a way to package your PWA as a native Android app that can be published on Google Play Store. It still uses your web content but runs in a native container with access to native APIs.

### Steps to Add Widget Support:

#### Step 1: Create TWA Project
```bash
# Install Bubblewrap (Google's TWA tool)
npm install -g @bubblewrap/cli

# Initialize TWA project
bubblewrap init --manifest https://garfieldapp.pages.dev/manifest.webmanifest

# Build the Android app
bubblewrap build
```

#### Step 2: Add Widget to TWA
Once you have a TWA, you need to add native Android code for the widget:

**File: `app/src/main/java/com/garfieldapp/ComicWidget.kt`**
```kotlin
package com.garfieldapp

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.bumptech.glide.Glide
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class ComicWidget : AppWidgetProvider() {
    
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        // Update all active widgets
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }
    
    private fun updateAppWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        // Create RemoteViews
        val views = RemoteViews(context.packageName, R.layout.widget_comic)
        
        // Fetch today's comic
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val comicUrl = getTodaysComicUrl()
                
                // Load image into widget using Glide
                val bitmap = Glide.with(context)
                    .asBitmap()
                    .load(comicUrl)
                    .submit()
                    .get()
                
                views.setImageViewBitmap(R.id.widget_comic_image, bitmap)
                
                // Update date text
                val dateFormat = SimpleDateFormat("MMMM dd, yyyy", Locale.getDefault())
                views.setTextViewText(R.id.widget_date, dateFormat.format(Date()))
                
                // Update widget
                appWidgetManager.updateAppWidget(appWidgetId, views)
            } catch (e: Exception) {
                // Handle error - show placeholder
                views.setTextViewText(R.id.widget_error, "Failed to load comic")
                appWidgetManager.updateAppWidget(appWidgetId, views)
            }
        }
        
        // Set click listener to open app
        val pendingIntent = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_layout, pendingIntent)
        
        appWidgetManager.updateAppWidget(appWidgetId, views)
    }
    
    private suspend fun getTodaysComicUrl(): String {
        val today = Calendar.getInstance()
        val year = today.get(Calendar.YEAR)
        val month = String.format("%02d", today.get(Calendar.MONTH) + 1)
        val day = String.format("%02d", today.get(Calendar.DAY_OF_MONTH))
        
        val url = "https://www.gocomics.com/garfield/$year/$month/$day"
        // Use your CORS proxy
        val proxyUrl = "https://corsproxy.garfieldapp.workers.dev/?${URLEncoder.encode(url, "UTF-8")}"
        
        val response = URL(proxyUrl).readText()
        
        // Extract image URL from HTML
        val regex = Regex("https://featureassets\\.gocomics\\.com/assets/[a-f0-9]{32}")
        return regex.find(response)?.value ?: throw Exception("Comic not found")
    }
}
```

**File: `app/src/main/res/layout/widget_comic.xml`**
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_layout"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/widget_background"
    android:padding="8dp">

    <TextView
        android:id="@+id/widget_date"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:textSize="14sp"
        android:textColor="#333333"
        android:gravity="center"
        android:paddingBottom="8dp"/>

    <ImageView
        android:id="@+id/widget_comic_image"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:scaleType="fitCenter"
        android:contentDescription="Today's Garfield Comic"/>

    <TextView
        android:id="@+id/widget_error"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:visibility="gone"
        android:textColor="#ff0000"
        android:gravity="center"/>
</LinearLayout>
```

**File: `app/src/main/res/xml/widget_info.xml`**
```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="180dp"
    android:updatePeriodMillis="3600000"
    android:previewImage="@drawable/widget_preview"
    android:initialLayout="@layout/widget_comic"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:description="@string/widget_description"/>
```

**Add to `AndroidManifest.xml`**
```xml
<receiver android:name=".ComicWidget"
    android:exported="true">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    </intent-filter>
    <meta-data
        android:name="android.appwidget.provider"
        android:resource="@xml/widget_info" />
</receiver>
```

**Add dependencies to `build.gradle`**
```gradle
dependencies {
    implementation 'com.github.bumptech.glide:glide:4.15.1'
    annotationProcessor 'com.github.bumptech.glide:compiler:4.15.1'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.1'
}
```

#### Step 3: Automatic Updates
Add a WorkManager job to refresh the widget daily:

**File: `ComicUpdateWorker.kt`**
```kotlin
class ComicUpdateWorker(context: Context, params: WorkerParameters) : 
    CoroutineWorker(context, params) {
    
    override suspend fun doWork(): Result {
        return try {
            // Update all widgets
            val appWidgetManager = AppWidgetManager.getInstance(applicationContext)
            val ids = appWidgetManager.getAppWidgetIds(
                ComponentName(applicationContext, ComicWidget::class.java)
            )
            
            val intent = Intent(applicationContext, ComicWidget::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            }
            applicationContext.sendBroadcast(intent)
            
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}

// Schedule in MainActivity
fun scheduleWidgetUpdate() {
    val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()
    
    val updateRequest = PeriodicWorkRequestBuilder<ComicUpdateWorker>(
        1, TimeUnit.DAYS
    )
        .setConstraints(constraints)
        .setInitialDelay(calculateDelayUntilMidnight(), TimeUnit.MILLISECONDS)
        .build()
    
    WorkManager.getInstance(this).enqueueUniquePeriodicWork(
        "comic_widget_update",
        ExistingPeriodicWorkPolicy.KEEP,
        updateRequest
    )
}
```

## Alternative: PWA Home Screen Shortcuts

While not a true widget, you can add **shortcuts** to your PWA manifest that appear when long-pressing the app icon:

**Update `manifest.webmanifest`:**
```json
{
  "shortcuts": [
    {
      "name": "Today's Comic",
      "short_name": "Today",
      "description": "View today's Garfield comic",
      "url": "/?comic=today",
      "icons": [
        {
          "src": "/icons/today-96x96.png",
          "sizes": "96x96"
        }
      ]
    },
    {
      "name": "Random Comic",
      "short_name": "Random",
      "url": "/?comic=random",
      "icons": [
        {
          "src": "/icons/random-96x96.png",
          "sizes": "96x96"
        }
      ]
    },
    {
      "name": "Favorites",
      "short_name": "Favs",
      "url": "/?view=favorites",
      "icons": [
        {
          "src": "/icons/heart-96x96.png",
          "sizes": "96x96"
        }
      ]
    }
  ]
}
```

## Recommended Approach

Given your PWA is already deployed on Cloudflare Pages:

1. **Keep the PWA as-is** for immediate use
2. **Create a TWA version** for Google Play Store with widget support
3. **Use Bubblewrap** to automate most of the TWA setup
4. **Add native widget code** as shown above
5. **Publish both versions** - PWA for web users, TWA for Android users who want widgets

### Resources
- [Bubblewrap Documentation](https://github.com/GoogleChromeLabs/bubblewrap)
- [Android Widget Development](https://developer.android.com/develop/ui/views/appwidgets/overview)
- [TWA Guide](https://developer.chrome.com/docs/android/trusted-web-activity/)
