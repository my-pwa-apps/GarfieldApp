using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage;
using WinRT;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace GarfieldNative;

/// <summary>
/// The main content page displayed inside the application window.
/// </summary>
public sealed partial class MainPage : Page
{
    private const string AppHostName = "garfield.local";
    private static readonly Guid DataTransferManagerGuid = new("A5CAEE9B-8708-49D1-8D36-67D25A8DA00C");
    private DataTransferManager? _dataTransferManager;
    private NativeSharePayload? _pendingShare;

    public MainPage()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
    {
        Loaded -= OnLoaded;

        string webAssetsPath = Path.Combine(AppContext.BaseDirectory, "WebAssets");
        if (!Directory.Exists(webAssetsPath))
        {
            webAssetsPath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WebAssets");
        }

        ConfigureWebViewForNativeTests();
        await AppWebView.EnsureCoreWebView2Async();
        ConfigureNativeShareBridge();
        AppWebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
            AppHostName,
            webAssetsPath,
            CoreWebView2HostResourceAccessKind.Allow);
        AppWebView.Source = new Uri($"https://{AppHostName}/index.html");
    }

    private static void ConfigureWebViewForNativeTests()
    {
        foreach (string argument in Environment.GetCommandLineArgs())
        {
            const string prefix = "--garfield-native-remote-debugging-port=";
            if (!argument.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            string portText = argument[prefix.Length..];
            if (!int.TryParse(portText, out int port) || port <= 0)
            {
                return;
            }

            string userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "GarfieldNative",
                $"WebView2-Test-{port}");

            Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", $"--remote-debugging-port={port}");
            Environment.SetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER", userDataFolder);
            return;
        }
    }

    private void ConfigureNativeShareBridge()
    {
        _dataTransferManager = GetDataTransferManagerForWindow(App.WindowHandle);
        _dataTransferManager.DataRequested += OnDataRequested;
        AppWebView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
    }

    private async void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        try
        {
            using JsonDocument document = JsonDocument.Parse(args.WebMessageAsJson);
            JsonElement root = document.RootElement;
            if (!TryGetString(root, "type", out string type) || type != "garfield-share")
            {
                return;
            }

            string id = TryGetString(root, "id", out string messageId) ? messageId : string.Empty;
            string title = TryGetString(root, "title", out string shareTitle) ? shareTitle : "Garfield";
            string text = TryGetString(root, "text", out string shareText) ? shareText : string.Empty;
            string fileName = TryGetString(root, "fileName", out string shareFileName) ? shareFileName : "garfield.jpg";
            string contentType = TryGetString(root, "contentType", out string shareContentType) ? shareContentType : "image/jpeg";

            if (!TryGetString(root, "base64", out string base64) || string.IsNullOrWhiteSpace(base64))
            {
                PostShareResult(id, false, "Missing share image data.");
                return;
            }

            StorageFile imageFile = await WriteShareImageAsync(fileName, base64);
            _pendingShare = new NativeSharePayload(id, title, text, contentType, imageFile);
            ShowShareUIForWindow(App.WindowHandle);
            PostShareResult(id, true);
        }
        catch (Exception error)
        {
            PostShareResult(string.Empty, false, error.Message);
        }
    }

    private void OnDataRequested(DataTransferManager sender, DataRequestedEventArgs args)
    {
        NativeSharePayload? payload = _pendingShare;
        if (payload is null)
        {
            args.Request.FailWithDisplayText("No Garfield comic is ready to share.");
            return;
        }

        args.Request.Data.Properties.Title = string.IsNullOrWhiteSpace(payload.Title) ? "Garfield" : payload.Title;
        args.Request.Data.Properties.Description = "Garfield comic";
        if (!string.IsNullOrWhiteSpace(payload.Text))
        {
            args.Request.Data.SetText(payload.Text);
        }
        args.Request.Data.SetStorageItems(new[] { payload.File });
    }

    private static async Task<StorageFile> WriteShareImageAsync(string fileName, string base64)
    {
        string safeFileName = string.IsNullOrWhiteSpace(fileName)
            ? "garfield.jpg"
            : string.Join("_", fileName.Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries));
        byte[] bytes = Convert.FromBase64String(base64);
        StorageFile file = await ApplicationData.Current.TemporaryFolder.CreateFileAsync(safeFileName, CreationCollisionOption.ReplaceExisting);
        await FileIO.WriteBytesAsync(file, bytes);
        return file;
    }

    private static bool TryGetString(JsonElement element, string propertyName, out string value)
    {
        value = string.Empty;
        if (!element.TryGetProperty(propertyName, out JsonElement property) || property.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = property.GetString() ?? string.Empty;
        return true;
    }

    private void PostShareResult(string id, bool ok, string? error = null)
    {
        string message = JsonSerializer.Serialize(new
        {
            type = "garfield-share-result",
            id,
            ok,
            error
        });
        AppWebView.CoreWebView2.PostWebMessageAsJson(message);
    }

    private static DataTransferManager GetDataTransferManagerForWindow(nint windowHandle)
    {
        IDataTransferManagerInterop interop = DataTransferManager.As<IDataTransferManagerInterop>();
        Guid guid = DataTransferManagerGuid;
        nint result = interop.GetForWindow(windowHandle, ref guid);
        return MarshalInterface<DataTransferManager>.FromAbi(result);
    }

    private static void ShowShareUIForWindow(nint windowHandle)
    {
        IDataTransferManagerInterop interop = DataTransferManager.As<IDataTransferManagerInterop>();
        interop.ShowShareUIForWindow(windowHandle);
    }

    private sealed record NativeSharePayload(string Id, string Title, string Text, string ContentType, StorageFile File);

    [ComImport]
    [Guid("3A3DCD6C-3EAB-43DC-BCDE-45671CE800C8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDataTransferManagerInterop
    {
        nint GetForWindow(nint appWindow, ref Guid riid);
        void ShowShareUIForWindow(nint appWindow);
    }
}
