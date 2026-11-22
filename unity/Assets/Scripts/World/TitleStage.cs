// The title page's backdrop: the real home island (LingmuScenes.BuildTitle builds it with HomeIslandBuilder.BuildWorld).
// The camera drifts slowly to and fro in front of the cottage after a gentle push-in; the hero and the starter fox wait at
// the door; trees sway and clouds pass as in the game. Owner 11-22: "主界面背景不好看 … 总体给我的感觉就是太厚重了".
using UnityEngine;

namespace Lingmu.World
{
    public class TitleStage : MonoBehaviour
    {
        public Vector3 focus;                       // the cottage
        public Vector3 heroAt;                      // in front of its door
        public float distance = 13.5f, height = 5.8f, lookUp = 2.9f;
        public float yaw = 14f, swing = 12f, period = 80f;    // degrees round the cottage; to and fro over `period` seconds
        Camera cam;
        float t0;

        // the sky drifts (Backdrop turns it): turn a copy, never the saved material (GameSession does the same in the game)
        void Awake() { if (RenderSettings.skybox) RenderSettings.skybox = new Material(RenderSettings.skybox); }

        void Start()
        {
            cam = Camera.main;
            Foliage.ApplyScene();
            if (ModelLibrary.Get)
            {
                ModelLibrary.Place("hero", transform, heroAt, 1.35f, true, 200);
                ModelLibrary.Place("pet_fox", transform, heroAt + new Vector3(0.95f, 0, -0.25f), 0.65f, true, 170);
            }
            t0 = Time.time;
            Place(0);
        }

        void Update() => Place(Time.time - t0);

        void Place(float t)
        {
            if (!cam) return;
            float a = (yaw + Mathf.Sin(t * Mathf.PI * 2 / period) * swing) * Mathf.Deg2Rad;
            float k = 1 - Mathf.Exp(-t * 0.35f);                      // push-in over the first few seconds
            float d = distance * Mathf.Lerp(1.3f, 1f, k), h = height * Mathf.Lerp(1.25f, 1f, k);
            cam.transform.position = focus + new Vector3(Mathf.Sin(a) * d, h, -Mathf.Cos(a) * d);
            cam.transform.LookAt(focus + Vector3.up * lookUp);
        }
    }
}
