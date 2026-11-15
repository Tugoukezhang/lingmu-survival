// Layout of the home island: which tiles are land, where the camp, farm, dock, bridge, cottage, trees and rocks are.
// Ported 1:1 from the web version (game/src/scenes/play/world.js buildIsland / placeObstacles, farm.js placeFarm),
// including the order of random numbers, so a seed gives the same island. Checked against the web version's own
// output by the EditMode test HomeIslandLayoutTests (reference: tools/unity/export_home_layout.mjs).
// Tile coordinates: x to the right (east), y downward (south), like the web version. See TileToWorld for Unity space.
using System;
using System.Collections.Generic;
using Lingmu.Core;
using UnityEngine;

namespace Lingmu.World
{
    [Serializable] public struct Tile { public int x, y; public Tile(int x, int y) { this.x = x; this.y = y; } public override string ToString() => $"({x},{y})"; }
    [Serializable] public struct TileRect { public int x, y, w, h; public TileRect(int x, int y, int w, int h) { this.x = x; this.y = y; this.w = w; this.h = h; } }
    [Serializable] public struct PlacedProp { public int x, y; public string kind; public PlacedProp(int x, int y, string kind) { this.x = x; this.y = y; this.kind = kind; } }

    public sealed class HomeIslandLayout
    {
        public const int Cols = 50, Rows = 34;
        public const int DefaultSeed = 20261108;          // web config.js SEED
        public const float TileSize = 1f;                 // one web tile (48 px) = 1 m in Unity

        public int Seed { get; private set; }
        public bool[,] Walk { get; private set; }         // [y, x]
        public Tile Spawn, Meadow, Campfire, Tent, Storage, DockTile, BridgeTile, ShipBox, SeedStand;
        public TileRect FarmRect, ExpandRect, CottageRect;
        public readonly List<PlacedProp> Trees = new List<PlacedProp>();
        public readonly List<PlacedProp> Rocks = new List<PlacedProp>();

        public bool IsLand(int x, int y) => x >= 0 && y >= 0 && x < Cols && y < Rows && Walk[y, x];

        // centre of a tile in Unity space: x east, z north (web y grows southward), y up
        public static Vector3 TileToWorld(float tx, float ty) => new Vector3((tx + 0.5f) * TileSize, 0f, -(ty + 0.5f) * TileSize);

        public static HomeIslandLayout Generate(int seed = DefaultSeed)
        {
            var L = new HomeIslandLayout { Seed = seed, Walk = new bool[Rows, Cols] };
            // buildIsland
            var noise = new ValueNoise2D(seed + 7L, 6);
            double cx = Cols / 2.0, cy = Rows / 2.0, rx = 21, ry = 13;
            for (int y = 0; y < Rows; y++)
                for (int x = 0; x < Cols; x++)
                {
                    double d = Math.Pow((x + 0.5 - cx) / rx, 2) + Math.Pow((y + 0.5 - cy) / ry, 2);
                    L.Walk[y, x] = d + (noise.Sample(x, y) - 0.5) * 0.7 < 1;
                }
            L.Spawn = new Tile((int)Math.Floor(cx), (int)Math.Floor(cy));
            L.Meadow = new Tile(L.Spawn.x - 7, L.Spawn.y + 2);
            L.FarmRect = new TileRect(L.Spawn.x + 4, L.Spawn.y + 2, 6, 4);
            L.ExpandRect = new TileRect(L.Spawn.x + 5, L.Spawn.y - 7, 6, 4);
            L.CottageRect = new TileRect(L.Spawn.x - 4, L.Spawn.y - 8, 4, 3);

            // the scene's random stream (PlayScene): 9 backdrop clouds × 5 numbers, then 1 per land tile (+3 when a flower is drawn)
            var rand = new Mulberry32(seed);
            for (int i = 0; i < 9 * 5; i++) rand.Next();
            for (int y = 0; y < Rows; y++) for (int x = 0; x < Cols; x++) if (L.Walk[y, x] && rand.Next() < 0.06) { rand.Next(); rand.Next(); rand.Next(); }

            // placeObstacles
            var s = L.Spawn;
            L.Campfire = new Tile(s.x - 2, s.y - 2);
            L.Tent = new Tile(s.x + 2, s.y - 2);
            L.Storage = new Tile(s.x + 3, s.y);
            int dy = s.y; while (L.IsLand(s.x, dy + 1)) dy++;
            L.DockTile = new Tile(s.x, dy);
            int wx = s.x; while (L.IsLand(wx - 1, s.y)) wx--;
            L.BridgeTile = new Tile(wx, s.y);
            var forest = new ValueNoise2D(seed + 23L, 5);
            for (int y = 1; y < Rows - 1; y++)
                for (int x = 1; x < Cols - 1; x++)
                {
                    if (!L.Inland(x, y) || L.Reserved(x, y)) continue;
                    double roll = rand.Next();
                    if (roll < 0.03 + forest.Sample(x, y) * 0.12) L.Trees.Add(new PlacedProp(x, y, (x * 7 + y * 13) % 3 == 0 ? "pine" : "apple"));
                    else if (roll > 0.985) L.Rocks.Add(new PlacedProp(x, y, (x + y) % 2 != 0 ? "rock_b" : "rock"));
                }
            // placeFarm: shipping box and seed stand on the right edge of the field
            L.ShipBox = new Tile(L.FarmRect.x + L.FarmRect.w, L.FarmRect.y);
            L.SeedStand = new Tile(L.FarmRect.x + L.FarmRect.w, L.FarmRect.y + 2);
            return L;
        }

        bool Inland(int x, int y) => IsLand(x, y) && IsLand(x, y - 1) && IsLand(x, y + 1) && IsLand(x - 1, y) && IsLand(x + 1, y);

        static double Hypot(double a, double b) => Math.Sqrt(a * a + b * b);
        static bool InRect(int x, int y, int x0, int x1, int y0, int y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

        bool Reserved(int x, int y) =>
            Hypot(x - Spawn.x, y - Spawn.y) < 3.5
            || Hypot((x - Meadow.x) / 1.6, y - Meadow.y) < 3.2
            || Hypot(x - DockTile.x, y - DockTile.y) < 2.5
            || Hypot(x - BridgeTile.x, y - BridgeTile.y) < 2.5
            || InRect(x, y, CottageRect.x - 1, CottageRect.x + CottageRect.w, CottageRect.y - 1, CottageRect.y + CottageRect.h + 1)
            || InRect(x, y, FarmRect.x - 1, FarmRect.x + FarmRect.w + 1, FarmRect.y - 1, FarmRect.y + FarmRect.h)
            || InRect(x, y, ExpandRect.x - 1, ExpandRect.x + ExpandRect.w, ExpandRect.y - 1, ExpandRect.y + ExpandRect.h + 1);
    }
}
