// Where the player may stand on an island: land tiles minus blocked tiles (trees, buildings, camp pieces).
// Same rule as the web version (play/world.js footFits): a small box around the feet must be on free tiles.
using UnityEngine;

namespace Lingmu.World
{
    public class IslandWalkMap : MonoBehaviour
    {
        [SerializeField] int cols, rows;
        [SerializeField] bool[] land, blocked;                 // row-major [y * cols + x]
        public static readonly Vector2 Foot = new Vector2(10f / 48f, 6f / 48f);   // web FOOT { hw: 10, hh: 6 } px → m

        public void Init(HomeIslandLayout L)
        {
            cols = HomeIslandLayout.Cols; rows = HomeIslandLayout.Rows;
            land = new bool[cols * rows]; blocked = new bool[cols * rows];
            for (int y = 0; y < rows; y++) for (int x = 0; x < cols; x++) land[y * cols + x] = L.Walk[y, x];
        }

        public void Block(int x, int y) { if (x >= 0 && y >= 0 && x < cols && y < rows) blocked[y * cols + x] = true; }
        public void Block(TileRect r) { for (int y = r.y; y < r.y + r.h; y++) for (int x = r.x; x < r.x + r.w; x++) if (IsLand(x, y)) Block(x, y); }

        public bool IsLand(int x, int y) => x >= 0 && y >= 0 && x < cols && y < rows && land[y * cols + x];
        public bool IsFree(int x, int y) => IsLand(x, y) && !blocked[y * cols + x];

        // world position (x east, z north) → tile (x, y south)
        public static Vector2Int TileAt(Vector3 p) => new Vector2Int(Mathf.FloorToInt(p.x / HomeIslandLayout.TileSize), Mathf.FloorToInt(-p.z / HomeIslandLayout.TileSize));

        public bool FootFits(Vector3 p)
        {
            for (int sx = -1; sx <= 1; sx += 2)
                for (int sz = -1; sz <= 1; sz += 2)
                {
                    var t = TileAt(p + new Vector3(sx * Foot.x, 0, sz * Foot.y));
                    if (!IsFree(t.x, t.y)) return false;
                }
            return true;
        }
    }
}
