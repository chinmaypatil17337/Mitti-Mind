import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Smartphone, X } from "lucide-react";

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the captured photo once the user confirms it. */
  onCapture: (file: File) => void;
}

// Labels virtual-camera apps commonly register under, so we can default to
// a connected phone (DroidCam / Iriun Webcam / EpocCam / OBS Virtual Camera)
// instead of the laptop's built-in webcam when one is available.
const PHONE_CAM_HINTS = ["droidcam", "iriun", "epoccam", "ivcam", "camo", "virtual"];

/**
 * Lets the user pick any camera the OS exposes to the browser — the laptop's
 * built-in webcam, or a phone connected as a webcam via an app like DroidCam
 * or Iriun Webcam — then take a shot, preview it, and confirm or retake.
 */
export const CameraCapture = ({ open, onOpenChange, onCapture }: CameraCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // List every camera the browser can see (built-in + any connected virtual
  // webcam) and pick a sensible default: a phone-webcam app if one is found,
  // otherwise the first device.
  const refreshDevices = useCallback(async (preferId?: string) => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === "videoinput");
      setDevices(cams);

      if (preferId && cams.some((d) => d.deviceId === preferId)) return preferId;

      const phoneCam = cams.find((d) =>
        PHONE_CAM_HINTS.some((hint) => d.label.toLowerCase().includes(hint))
      );
      return (phoneCam ?? cams[0])?.deviceId;
    } catch {
      return undefined;
    }
  }, []);

  const startStream = useCallback(
    async (preferId?: string) => {
      setError(null);
      setStarting(true);
      stopStream();
      try {
        // A first getUserMedia call is needed before device labels are
        // available, then we re-enumerate to show real device names.
        const initial = await navigator.mediaDevices.getUserMedia({
          video: preferId ? { deviceId: { exact: preferId } } : { facingMode: "environment" },
          audio: false,
        });

        const chosenId = await refreshDevices(preferId);
        const initialId = initial.getVideoTracks()[0]?.getSettings().deviceId;

        if (chosenId && chosenId !== initialId) {
          initial.getTracks().forEach((t) => t.stop());
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: chosenId } },
            audio: false,
          });
          streamRef.current = stream;
        } else {
          streamRef.current = initial;
        }

        setDeviceId(chosenId);
        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera access was denied. Please allow camera permission and try again."
            : "Could not access that camera. If you're using a phone as a webcam, make sure its app is connected first."
        );
      } finally {
        setStarting(false);
      }
    },
    [refreshDevices, stopStream]
  );

  const switchDevice = async (id: string) => {
    setDeviceId(id);
    setError(null);
    setStarting(true);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: id } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setError("Could not switch to that camera.");
    } finally {
      setStarting(false);
    }
  };

  // Start the camera when the dialog opens, and always release it when the
  // dialog closes / unmounts.
  useEffect(() => {
    if (!open) {
      stopStream();
      setPhoto((p) => {
        if (p) URL.revokeObjectURL(p.url);
        return null;
      });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera capture is not supported in this browser.");
      return;
    }
    if (!photo) startStream(deviceId);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPhoto({ blob, url: URL.createObjectURL(blob) });
        stopStream(); // freeze on the captured frame, release the camera
      },
      "image/jpeg",
      0.92
    );
  };

  const retake = () => {
    setPhoto((p) => {
      if (p) URL.revokeObjectURL(p.url);
      return null;
    });
    startStream(deviceId);
  };

  const confirm = () => {
    if (!photo) return;
    const file = new File([photo.blob], `leaf-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    onOpenChange(false);
  };

  const selectedDevice = devices.find((d) => d.deviceId === deviceId);
  const selectedIsPhoneCam = selectedDevice
    ? PHONE_CAM_HINTS.some((hint) => selectedDevice.label.toLowerCase().includes(hint))
    : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Take a photo of the leaf
          </DialogTitle>
        </DialogHeader>

        {!photo && devices.length > 0 && (
          <div className="space-y-1">
            <Select value={deviceId} onValueChange={switchDevice} disabled={starting}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a camera" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d, i) => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedIsPhoneCam && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Smartphone className="h-3 w-3" /> Using your phone as the camera
              </p>
            )}
          </div>
        )}

        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
          {error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white">
              {error}
            </div>
          ) : photo ? (
            <img src={photo.url} alt="Captured leaf" className="h-full w-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          )}
          {starting && !photo && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
              Starting camera...
            </div>
          )}
        </div>

        {!photo && devices.length === 0 && !error && (
          <p className="text-xs text-muted-foreground">
            No camera found yet. To use your phone, install a webcam app on it (e.g. DroidCam or
            Iriun Webcam), connect it to this computer, then reopen this dialog.
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          {!photo ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Refresh camera list"
                disabled={starting}
                onClick={() => startStream(deviceId)}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button type="button" className="flex-1" disabled={!!error || starting} onClick={takePhoto}>
                <Camera className="mr-2 h-4 w-4" /> Capture
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" className="flex-1" onClick={retake}>
                <RefreshCw className="mr-2 h-4 w-4" /> Retake
              </Button>
              <Button type="button" className="flex-1" onClick={confirm}>
                Use this photo
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
