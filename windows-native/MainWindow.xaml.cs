using Microsoft.UI.Xaml;
using System;
using System.Runtime.InteropServices;
using Windows.Graphics;
using Windows.Storage;
using WinRT.Interop;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace GarfieldNative;

/// <summary>
/// The application window. This hosts a Frame that displays pages. Add your
/// UI and logic to MainPage.xaml / MainPage.xaml.cs instead of here so you
/// can use Page features such as navigation events and the Loaded lifecycle.
/// </summary>
public sealed partial class MainWindow : Window
{
    private const int DefaultWindowWidth = 1000;
    private const int DefaultWindowHeight = 760;
    private const int MinWindowWidth = 820;
    private const int MinWindowHeight = 620;
    private const string WindowWidthKey = "WindowWidth";
    private const string WindowHeightKey = "WindowHeight";
    private const int GWLP_WNDPROC = -4;
    private const uint WM_GETMINMAXINFO = 0x0024;

    private nint _windowHandle;
    private nint _previousWndProc;
    private WndProc? _windowProc;

    public MainWindow()
    {
        InitializeComponent();

        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        AppWindow.SetIcon("Assets/AppIcon.ico");
        ConfigureWindowBounds();

        // Navigate the root frame to the main page on startup.
        RootFrame.Navigate(typeof(MainPage));
    }

    private void ConfigureWindowBounds()
    {
        _windowHandle = WindowNative.GetWindowHandle(this);
        _windowProc = WindowProc;
        _previousWndProc = SetWindowLongPtr(_windowHandle, GWLP_WNDPROC, Marshal.GetFunctionPointerForDelegate(_windowProc));

        AppWindow.Resize(GetInitialWindowSize());
        AppWindow.Changed += OnAppWindowChanged;
    }

    private static SizeInt32 GetInitialWindowSize()
    {
        ApplicationDataContainer settings = ApplicationData.Current.LocalSettings;
        int width = settings.Values[WindowWidthKey] is int savedWidth ? savedWidth : DefaultWindowWidth;
        int height = settings.Values[WindowHeightKey] is int savedHeight ? savedHeight : DefaultWindowHeight;

        return new SizeInt32(
            Math.Max(width, MinWindowWidth),
            Math.Max(height, MinWindowHeight));
    }

    private void OnAppWindowChanged(Microsoft.UI.Windowing.AppWindow sender, Microsoft.UI.Windowing.AppWindowChangedEventArgs args)
    {
        if (!args.DidSizeChange)
        {
            return;
        }

        ApplicationDataContainer settings = ApplicationData.Current.LocalSettings;
        settings.Values[WindowWidthKey] = Math.Max(sender.Size.Width, MinWindowWidth);
        settings.Values[WindowHeightKey] = Math.Max(sender.Size.Height, MinWindowHeight);
    }

    private nint WindowProc(nint hWnd, uint message, nint wParam, nint lParam)
    {
        if (message == WM_GETMINMAXINFO)
        {
            MINMAXINFO minMaxInfo = Marshal.PtrToStructure<MINMAXINFO>(lParam);
            minMaxInfo.ptMinTrackSize.X = MinWindowWidth;
            minMaxInfo.ptMinTrackSize.Y = MinWindowHeight;
            Marshal.StructureToPtr(minMaxInfo, lParam, true);
        }

        return CallWindowProc(_previousWndProc, hWnd, message, wParam, lParam);
    }

    private delegate nint WndProc(nint hWnd, uint message, nint wParam, nint lParam);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern nint SetWindowLongPtr64(nint hWnd, int nIndex, nint dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)]
    private static extern int SetWindowLong32(nint hWnd, int nIndex, int dwNewLong);

    private static nint SetWindowLongPtr(nint hWnd, int nIndex, nint dwNewLong)
    {
        return IntPtr.Size == 8
            ? SetWindowLongPtr64(hWnd, nIndex, dwNewLong)
            : SetWindowLong32(hWnd, nIndex, dwNewLong.ToInt32());
    }

    [DllImport("user32.dll", EntryPoint = "CallWindowProcW")]
    private static extern nint CallWindowProc(nint lpPrevWndFunc, nint hWnd, uint msg, nint wParam, nint lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MINMAXINFO
    {
        public POINT ptReserved;
        public POINT ptMaxSize;
        public POINT ptMaxPosition;
        public POINT ptMinTrackSize;
        public POINT ptMaxTrackSize;
    }
}
