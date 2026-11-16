// A wild pet on an expedition island (web scenes/play/actors.js updateWild): wanders near its spot, fills a notice
// meter while the player is close and visible (sneaking, cover and the night fog slow it), then shy pets run and bold
// ones charge. Touching it starts a battle (an ambush if it never noticed you). Distances follow the web rules in px.
using Lingmu.Rules;
using Lingmu.World;
using TMPro;
using UnityEngine;

namespace Lingmu.Game
{
    public class WildPet : MonoBehaviour
    {
        public string id, species, temper;
        public int level;
        public Transform model;
        public float meter;
        public string mode = "calm";                 // calm | flee | charge
        public Vector2 face = Vector2.down;          // web px direction (x east, y south)
        public float cooldown;                       // no encounter before this time
        Vector3 home, target;
        float modeUntil, wanderAt, phase, baseY;
        Animator anim;
        WorldTag tag;
        ExpeditionArea area;

        public void Init(ExpeditionArea a, string wildId, string sp, int lv, Vector3 at)
        {
            area = a; id = wildId; species = sp; level = lv; temper = Stealth.TemperOf(sp);
            home = target = at; transform.position = at;
            var a2 = Random.value * Mathf.PI * 2; face = new Vector2(Mathf.Cos(a2), Mathf.Sin(a2));
            float h = sp == "starbear" || sp == "shark" ? 0.75f : 0.65f;
            var g = ModelLibrary.Place("pet_" + sp, transform, at, h, true, 0);
            model = g.transform; baseY = model.localPosition.y;
            anim = g.GetComponentInChildren<Animator>();
            var data = GameData.Species(sp);
            tag = WorldTag.Create(transform, $"Lv.{lv}", h + 0.32f, ElementColor(data.element));
            cooldown = Time.time + 3f;   // 3 seconds of peace after arriving
            phase = Random.value * 6;
        }

        public static Color ElementColor(string el) => el switch
        {
            "水" => new Color(0.30f, 0.62f, 0.9f), "火" => new Color(0.93f, 0.45f, 0.25f), "森" => new Color(0.38f, 0.7f, 0.3f),
            "光" => new Color(0.95f, 0.75f, 0.2f), "暗" => new Color(0.55f, 0.35f, 0.7f), _ => new Color(0.6f, 0.55f, 0.5f),
        };

        static Vector2 Px(Vector3 w) => new Vector2(w.x * GameSession.PxPerMeter, -w.z * GameSession.PxPerMeter);

        // how the player stands relative to this pet right now (for the throw button and the meter)
        public (float dist, float angle, string stealth) StealthTo(Vector3 player)
        {
            var d = Px(player) - Px(transform.position);
            float angle = (float)Stealth.AngleFromFacing(face.x, face.y, d.x, d.y);
            return (d.magnitude, angle, Stealth.StealthOf(meter, angle));
        }

        public void Noticed()
        {
            meter = 1;
            if (temper == "bold") { mode = "charge"; modeUntil = Time.time + 6; }
            else { mode = "flee"; modeUntil = Time.time + 3.5f; HopAway(170); }
        }

        public void HopAway(float farPx = 70)
        {
            var p = area.Player.position;
            var away = transform.position - p; away.y = 0;
            var t = transform.position + away.normalized * (farPx / GameSession.PxPerMeter);
            target = area.Walkable(t) ? t : home;
            wanderAt = Time.time + 3;
        }

        public void AfterBattle(string result)
        {
            cooldown = Time.time + (result == "lose" ? 8 : 4);
            mode = "calm"; meter = 0;
            HopAway();
        }

        void Update()
        {
            var session = GameSession.I;
            if (session == null || session.Battle != null || !session.player) return;
            bool calmWorld = session.Clock.Paused;
            float dt = Mathf.Min(Time.deltaTime, 0.05f);
            var p = session.player.position;
            var look = StealthTo(p);
            if (!calmWorld)
            {
                if (mode == "calm" && Time.time > cooldown)
                {
                    bool sneaking = Player.PlayerMover.LastPush < Stealth.SneakPush;
                    meter = (float)Stealth.NoticeStep(meter, look.dist, look.angle, dt, sneaking, area.PlayerCovered(), Night.IsFoggy(session.S.clock));
                    if (meter >= 1) Noticed();
                }
                else if (mode != "calm" && Time.time > modeUntil) { mode = "calm"; meter = 0.6f; wanderAt = 0; }
                if (mode == "charge")
                {
                    target = p;
                    if (look.dist > Stealth.Radius * 1.6f) { mode = "calm"; meter = 0.5f; target = home; }
                }
                else if (mode == "calm" && Time.time > wanderAt)
                {
                    for (int k = 0; k < 6; k++)
                    {
                        var t = home + new Vector3((Random.value - 0.5f) * 140, 0, (Random.value - 0.5f) * 100) / GameSession.PxPerMeter;
                        if (area.Walkable(t)) { target = t; break; }
                    }
                    wanderAt = Time.time + 2.5f + Random.value * 3.5f;
                }
            }
            var to = target - transform.position; to.y = 0;
            float dist = to.magnitude;
            float speed = (mode == "flee" ? 120 : mode == "charge" ? 95 : 36) / GameSession.PxPerMeter;
            bool moving = dist > 3 / GameSession.PxPerMeter && !calmWorld;
            if (moving)
            {
                var step = to / dist * Mathf.Min(dist, speed * dt);
                var n = transform.position + step;
                if (area.Walkable(n)) transform.position = n; else wanderAt = 0;
                face = new Vector2(to.x, -to.z).normalized;
            }
            if (mode == "calm" && meter >= Stealth.Look && look.dist <= Stealth.Radius) { var d = p - transform.position; face = new Vector2(d.x, -d.z).normalized; }
            // turn the model to face where it looks (web y is south = -z)
            var fw = new Vector3(face.x, 0, -face.y);
            if (fw.sqrMagnitude > 0.01f) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(fw), 10 * dt);
            phase += dt * (moving ? 9 : 2.5f);
            // blend idle → hop → run smoothly instead of snapping between clips
            if (anim) anim.SetFloat("Speed", !moving ? 0 : mode == "calm" ? 1 : 2, 0.12f, dt);
            else if (model) model.localPosition = new Vector3(model.localPosition.x, baseY + Mathf.Abs(Mathf.Sin(phase)) * (moving ? 0.08f : 0.025f), model.localPosition.z);
            tag.SetMeter(meter > 0.02f && meter < 1 ? meter : 0, meter >= Stealth.Look);
            tag.SetAlert(mode != "calm");
            // touching it: a battle
            if (!calmWorld && Time.time > cooldown && look.dist < 34)
            {
                cooldown = Time.time + 4;
                bool ambush = mode == "calm" && meter < 1;
                if (!area.Encounter(this, ambush)) HopAway();
            }
        }
    }

    // a label that floats over a thing and always faces the camera; can show a small notice meter and a "!"
    public class WorldTag : MonoBehaviour
    {
        TextMeshPro text, mark;
        Transform bar, barFill;
        Renderer fillR;

        public static WorldTag Create(Transform parent, string label, float height, Color bg)
        {
            var go = new GameObject("tag"); go.transform.SetParent(parent, false); go.transform.localPosition = new Vector3(0, height, 0);
            var t = go.AddComponent<WorldTag>();
            t.text = MakeText(go.transform, label, 2.2f, Color.white, Vector3.zero);
            t.text.fontStyle = FontStyles.Bold; t.text.outlineWidth = 0.25f; t.text.outlineColor = bg;
            t.mark = MakeText(go.transform, "!", 4f, new Color(0.91f, 0.27f, 0.23f), new Vector3(0, 0.42f, 0));
            t.mark.outlineWidth = 0.3f; t.mark.outlineColor = Color.white; t.mark.gameObject.SetActive(false);
            t.bar = GameObject.CreatePrimitive(PrimitiveType.Quad).transform; Destroy(t.bar.GetComponent<Collider>());
            t.bar.SetParent(go.transform, false); t.bar.localPosition = new Vector3(0, 0.24f, 0.001f); t.bar.localScale = new Vector3(0.5f, 0.08f, 1);
            t.bar.GetComponent<Renderer>().sharedMaterial = Unlit(new Color(0.23f, 0.15f, 0.09f, 1));
            t.barFill = GameObject.CreatePrimitive(PrimitiveType.Quad).transform; Destroy(t.barFill.GetComponent<Collider>());
            t.barFill.SetParent(go.transform, false); t.fillR = t.barFill.GetComponent<Renderer>(); t.fillR.material = Unlit(new Color(0.96f, 0.78f, 0.29f));
            t.SetMeter(0, false);
            return t;
        }

        static TextMeshPro MakeText(Transform parent, string s, float size, Color c, Vector3 pos)
        {
            var go = new GameObject("text"); go.transform.SetParent(parent, false); go.transform.localPosition = pos;
            var t = go.AddComponent<TextMeshPro>();
            t.font = UI.UiKit.Bold; t.text = s; t.fontSize = size; t.color = c; t.alignment = TextAlignmentOptions.Center;
            t.rectTransform.sizeDelta = new Vector2(2, 0.6f); t.textWrappingMode = TextWrappingModes.NoWrap;
            return t;
        }

        static Material Unlit(Color c)
        {
            var m = new Material(Shader.Find("Universal Render Pipeline/Unlit")); m.SetColor("_BaseColor", c); return m;
        }

        public void SetText(string s) => text.text = s;
        public void SetMeter(float v, bool hot)
        {
            bool on = v > 0;
            bar.gameObject.SetActive(on); barFill.gameObject.SetActive(on);
            if (!on) return;
            barFill.localScale = new Vector3(0.46f * v, 0.05f, 1);
            barFill.localPosition = new Vector3(-0.23f + 0.23f * v, 0.24f, 0);
            fillR.material.SetColor("_BaseColor", hot ? new Color(0.94f, 0.54f, 0.23f) : new Color(0.96f, 0.78f, 0.29f));
        }
        public void SetAlert(bool on) { if (mark.gameObject.activeSelf != on) mark.gameObject.SetActive(on); }

        void LateUpdate()
        {
            var cam = Camera.main;
            if (cam) transform.rotation = Quaternion.LookRotation(transform.position - cam.transform.position, Vector3.up);
        }
    }
}
