/*
 * AgroLens — ESP32 Pump Controller
 * ---------------------------------
 * Part of the "AI detection -> treatment decision -> IoT command -> pump"
 * prototype. This sketch does ONE thing: it runs a tiny HTTP server and
 * waits for the AgroLens backend (the iot-treatment Supabase Edge
 * Function) to POST a command telling it which pump to run and for how
 * long. All dosing/duration DECISIONS are made by the backend
 * (supabase/functions/iot-treatment/index.ts) — this firmware never
 * decides anything on its own, it just executes the command it's given.
 *
 * PROTOTYPE SAFETY NOTE: wire this to a container of plain water (or a
 * harmless, highly diluted test solution) while demonstrating the system,
 * not real concentrated fertilizer/chemicals. See the project README.
 *
 * -------------------------------------------------------------------------
 * HARDWARE
 * -------------------------------------------------------------------------
 *   ESP32 dev board
 *   Up to 5 small 5V relay modules (one per pump/solution), or 1 for the
 *   minimal single-plant demo
 *   Small submersible/peristaltic pump(s), tube, nozzle, container
 *
 *   Relay IN pins -> ESP32 GPIOs (edit PUMP_PINS below to match your wiring)
 *   Relay VCC/GND -> ESP32 5V/GND (or a separate 5V supply + common ground)
 *   Pump +/- -> relay NO (normally-open) + COM, pump power -> external supply
 *
 * -------------------------------------------------------------------------
 * COMMUNICATION — why plain HTTP
 * -------------------------------------------------------------------------
 * For a single prototype plant on the same Wi-Fi network as the backend,
 * a tiny HTTP server on the ESP32 is the simplest reliable choice:
 *   - No broker to run/host (unlike MQTT, which needs a broker such as
 *     Mosquitto reachable by both the backend and the ESP32).
 *   - The backend already speaks HTTP/JSON everywhere else (Supabase Edge
 *     Functions), so this reuses the exact same `fetch()` pattern.
 *   - Request/response is a natural fit for "send a command, get back
 *     success/failure" — there's no need for MQTT's pub/sub fan-out here
 *     since there's exactly one ESP32 and one backend.
 * If you later add many ESP32 units (one per plant/field) and want the
 * backend to push to all of them without polling each one's IP, MQTT
 * becomes the better fit — but for this one-plant college prototype, HTTP
 * is the simplest thing that works and is the easiest to debug (you can
 * test it with curl).
 *
 * -------------------------------------------------------------------------
 * SETUP
 * -------------------------------------------------------------------------
 * 1. Fill in WIFI_SSID / WIFI_PASSWORD below.
 * 2. Flash this sketch. Open the Serial Monitor (115200 baud) to see the
 *    IP address it's assigned.
 * 3. Set that IP as the ESP32_BASE_URL secret for the iot-treatment Edge
 *    Function, e.g. http://192.168.1.50 (no trailing slash).
 *    `supabase secrets set ESP32_BASE_URL=http://192.168.1.50`
 * 4. Test it directly first:
 *    curl -X POST http://192.168.1.50/activate \
 *      -H "Content-Type: application/json" \
 *      -d '{"pump":"pump_1","duration":3}'
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h> // Install "ArduinoJson" via Library Manager

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

WebServer server(80);

// Map each logical pump name (used by the backend's TREATMENT_RULES) to a
// physical GPIO pin driving its relay. Extend/trim this for your wiring.
struct PumpPin {
  const char* name;
  int pin;
};

PumpPin PUMP_PINS[] = {
  { "pump_1", 16 }, // e.g. nitrogen solution
  { "pump_2", 17 }, // e.g. potassium solution
  { "pump_3", 18 }, // e.g. iron solution
  { "pump_4", 19 }, // e.g. fungicide/disease treatment
  { "pump_5", 21 }, // e.g. pest treatment
};
const int NUM_PUMPS = sizeof(PUMP_PINS) / sizeof(PUMP_PINS[0]);

// Safety ceiling: never run a pump longer than this, no matter what the
// backend requests. A bug upstream should never be able to flood the pot.
const unsigned long MAX_DURATION_SECONDS = 15;

int pinForPump(const String& pumpName) {
  for (int i = 0; i < NUM_PUMPS; i++) {
    if (pumpName == PUMP_PINS[i].name) return PUMP_PINS[i].pin;
  }
  return -1;
}

void handleActivate() {
  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"Use POST\"}");
    return;
  }

  StaticJsonDocument<256> body;
  DeserializationError err = deserializeJson(body, server.arg("plain"));
  if (err) {
    server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }

  String pumpName = body["pump"] | "";
  long duration = body["duration"] | 0;

  int pin = pinForPump(pumpName);
  if (pin < 0) {
    server.send(400, "application/json", "{\"error\":\"Unknown pump name\"}");
    return;
  }
  if (duration <= 0 || duration > (long)MAX_DURATION_SECONDS) {
    server.send(400, "application/json", "{\"error\":\"duration out of allowed range\"}");
    return;
  }

  Serial.printf("Activating %s (pin %d) for %ld seconds\n", pumpName.c_str(), pin, duration);

  digitalWrite(pin, HIGH);        // turn pump/relay on
  delay(duration * 1000UL);       // simple blocking delay is fine for a single-plant prototype
  digitalWrite(pin, LOW);         // turn it back off

  StaticJsonDocument<128> resp;
  resp["status"] = "ok";
  resp["pump"] = pumpName;
  resp["duration"] = duration;
  String out;
  serializeJson(resp, out);
  server.send(200, "application/json", out);
}

void handleStatus() {
  StaticJsonDocument<128> resp;
  resp["status"] = "ready";
  resp["wifi"] = WiFi.status() == WL_CONNECTED;
  String out;
  serializeJson(resp, out);
  server.send(200, "application/json", out);
}

void setup() {
  Serial.begin(115200);

  for (int i = 0; i < NUM_PUMPS; i++) {
    pinMode(PUMP_PINS[i].pin, OUTPUT);
    digitalWrite(PUMP_PINS[i].pin, LOW); // pumps off by default
  }

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected. IP address: ");
  Serial.println(WiFi.localIP());

  server.on("/activate", handleActivate);
  server.on("/status", HTTP_GET, handleStatus);
  server.begin();
  Serial.println("HTTP server started.");
}

void loop() {
  server.handleClient();
}
