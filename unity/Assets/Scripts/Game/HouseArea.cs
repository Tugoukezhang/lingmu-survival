// Inside the cottage (web scenes/play/house.js): a 12×8 room with the bed top left and the door at the bottom middle.
// Furniture from the save is shown standing on its cells (TEMPORARY: the item art on a stand-up card, until the
// furniture models arrive); 布置 places, moves, turns and puts away pieces in front of the player.
using System.Collections.Generic;
using Lingmu.Rules;
using Lingmu.World;
using UnityEngine;

namespace Lingmu.Game
{
    public class HouseArea : Area
    {
        public override string Id => "house";
        public const int OX = 1, OY = 1;                         // room cell (0,0) = tile (1,1)
        public static int Cols => House.RoomW + 2;
        public static int Rows => House.RoomH + 3;
        const float InteractRange = 80f / GameSession.PxPerMeter;

        public IslandWalkMap walk;
        Transform furn;
        readonly List<Spot> spots = new List<Spot>();

        public static Vector3 Cell(float x, float y) => HomeIslandLayout.TileToWorld(OX + x, OY + y);

        void Awake()
        {
            spots.Add(new Spot { kind = "bed", verb = "睡觉", label = "床 · 睡觉开始新的一天", pos = Cell(0.5f, 1.6f) });
            spots.Add(new Spot { kind = "door", verb = "出门", label = "门 · 回到家园", pos = Cell(5.5f, House.RoomH - 0.6f) });
            spots.Add(new Spot { kind = "decorate", verb = "布置", label = "布置板 · 摆放家具", pos = Cell(8f, 0.2f) });
            furn = new GameObject("Furniture").transform;
        }

        void Start() => Refresh();

        public override bool CanStand(Vector3 p) => !walk || walk.FootFits(p);
        public override Vector3 ArrivePoint(GameState s) => Cell(5.5f, House.RoomH - 1.2f);

        public override Spot CurrentSpot(Vector3 p)
        {
            Spot best = null; float bestD = InteractRange;
            foreach (var s in spots)
            {
                float d = Vector2.Distance(new Vector2(p.x, p.z), new Vector2(s.pos.x, s.pos.z));
                if (d < bestD) { bestD = d; best = s; }
            }
            return best;
        }

        public override string Act(Spot s)
        {
            switch (s.kind)
            {
                case "bed": Session.EndDay(true); return null;
                case "door": Session.GoTo("home"); return null;
                case "decorate": return "decorate";
            }
            return null;
        }

        // ---------- furniture ----------
        (int x, int y) FrontCell()
        {
            var p = Session.player.position;
            var f = Session.player.GetComponent<Player.PlayerMover>()?.Facing ?? Vector3.back;
            var c = p + new Vector3(f.x, 0, f.z).normalized * 1.0f;
            return (Mathf.FloorToInt(c.x) - OX, Mathf.FloorToInt(-c.z) - OY);
        }

        static readonly (int dx, int dy)[] Near = { (0, 0), (1, 0), (-1, 0), (0, -1), (0, 1), (1, -1), (-1, -1), (2, 0), (-2, 0) };

        public void PlaceInFront(string id)
        {
            var (fx, fy) = FrontCell();
            foreach (var (dx, dy) in Near)
            {
                var r = House.Place(S, id, fx + dx, fy + dy, 0);
                if (r.ok) { Session.Say($"摆好了{GameData.Item(id).name}"); Refresh(); Session.Save(); Session.AfterAction(); return; }
            }
            Session.Say("面前放不下，换个空一点的地方再试");
        }

        public void MoveInFront(int index)
        {
            var (fx, fy) = FrontCell();
            foreach (var (dx, dy) in Near)
                if (House.Move(S, index, fx + dx, fy + dy).ok) { Refresh(); Session.Save(); Session.AfterAction(); return; }
            Session.Say("面前放不下");
        }

        public void Rotate(int index) { var r = House.Rotate(S, index); if (!r.ok) Session.Say("转过来会碰到别的东西"); Refresh(); Session.Save(); Session.AfterAction(); }
        public void PickUp(int index) { var r = House.PickUp(S, index); if (!r.ok) Session.Say("背包满了"); Refresh(); Session.Save(); Session.AfterAction(); }

        public void Refresh()
        {
            foreach (Transform c in furn) Destroy(c.gameObject);
            if (walk) { for (int y = 0; y < House.RoomH; y++) for (int x = 0; x < House.RoomW; x++) walk.Unblock(OX + x, OY + y); walk.Block(OX, OY); walk.Block(OX + 1, OY); walk.Block(OX, OY + 1); walk.Block(OX + 1, OY + 1); }
            foreach (var it in House.Of(S).items)
            {
                var (w, h) = House.Footprint(it.id, it.rot);
                var def = House.Furniture[it.id];
                var centre = Cell(it.x + w / 2f - 0.5f, it.y + h / 2f - 0.5f);
                var sprite = UI.UiKit.Icon(it.id);
                var go = new GameObject(it.id); go.transform.SetParent(furn, false);
                var sr = go.AddComponent<SpriteRenderer>(); sr.sprite = sprite;
                float size = Mathf.Max(w, h) * 0.95f;
                float scale = sprite ? size / (sprite.bounds.size.x) : 1;
                go.transform.localScale = Vector3.one * scale;
                if (def.floor) { go.transform.position = centre + Vector3.up * 0.02f; go.transform.rotation = Quaternion.Euler(90, 0, 0); sr.sortingOrder = -1; }
                else { go.transform.position = centre; go.AddComponent<Billboard>().lift = sprite ? sprite.bounds.size.y * scale * 0.5f : 0.5f; }
                if (!def.floor && walk) foreach (var c in Cells(it, w, h)) walk.Block(OX + c.x, OY + c.y);
                if (def.light) { var l = new GameObject("lamp light").AddComponent<Light>(); l.transform.SetParent(go.transform, false); l.transform.position = centre + Vector3.up * 1.2f; l.type = LightType.Point; l.color = new Color(1f, 0.82f, 0.55f); l.range = 4; l.intensity = 1.5f; l.shadows = LightShadows.None; }
            }
        }

        static IEnumerable<Vector2Int> Cells(HouseItem it, int w, int h) { for (int dy = 0; dy < h; dy++) for (int dx = 0; dx < w; dx++) yield return new Vector2Int(it.x + dx, it.y + dy); }
    }

    // a flat picture standing up and turning towards the camera (around the vertical axis only)
    public class Billboard : MonoBehaviour
    {
        public float lift;
        Vector3 basePos; bool init;
        void LateUpdate()
        {
            if (!init) { basePos = transform.position; init = true; }
            var cam = Camera.main; if (!cam) return;
            var d = cam.transform.position - basePos; d.y = 0;
            if (d.sqrMagnitude > 1e-4f) transform.rotation = Quaternion.LookRotation(-d);
            transform.position = basePos + Vector3.up * lift;
        }
    }
}
