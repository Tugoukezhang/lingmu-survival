// The Unity port of the home island must give exactly the web version's island (same seed → same tiles, same trees).
// Reference file: Data/home_layout_ref.json, written by tools/unity/export_home_layout.mjs from the web rule code.
using System;
using System.IO;
using System.Linq;
using Lingmu.Core;
using Lingmu.World;
using NUnit.Framework;
using UnityEngine;

public class HomeIslandLayoutTests
{
    [Serializable] class Ref
    {
        public int seed, cols, rows;
        public string[] walk;
        public Tile spawn, meadow, campfire, tent, storage, dockTile, bridgeTile, shipbox, seedstand;
        public TileRect farmRect, expandRect, cottageRect;
        public PlacedProp[] trees, rocks;
    }

    static Ref Load() => JsonUtility.FromJson<Ref>(File.ReadAllText(Path.Combine(Application.dataPath, "Tests/EditMode/Data/home_layout_ref.json")));

    [Test] public void RandomNumbersMatchTheWebVersion()
    {
        // first numbers of mulberry32(1), computed with game/src/systems/rng.js
        var r = new Mulberry32(1);
        Assert.AreEqual(0.6270739405881613, r.Next(), 1e-15);
        Assert.AreEqual(0.002735721180215478, r.Next(), 1e-15);
        Assert.AreEqual(0.5274470399599522, r.Next(), 1e-15);
    }

    [Test] public void LandTilesMatchTheWebVersion()
    {
        var reference = Load();
        var L = HomeIslandLayout.Generate(reference.seed);
        Assert.AreEqual(reference.rows, HomeIslandLayout.Rows);
        Assert.AreEqual(reference.cols, HomeIslandLayout.Cols);
        for (int y = 0; y < reference.rows; y++)
        {
            var row = new string(Enumerable.Range(0, reference.cols).Select(x => L.Walk[y, x] ? '1' : '0').ToArray());
            Assert.AreEqual(reference.walk[y], row, $"row {y}");
        }
    }

    [Test] public void CampFarmDockAndBridgeMatchTheWebVersion()
    {
        var reference = Load();
        var L = HomeIslandLayout.Generate(reference.seed);
        void Same(Tile a, Tile b, string what) => Assert.AreEqual((a.x, a.y), (b.x, b.y), what);
        Same(reference.spawn, L.Spawn, "spawn"); Same(reference.meadow, L.Meadow, "meadow");
        Same(reference.campfire, L.Campfire, "campfire"); Same(reference.tent, L.Tent, "tent"); Same(reference.storage, L.Storage, "storage");
        Same(reference.dockTile, L.DockTile, "dock"); Same(reference.bridgeTile, L.BridgeTile, "bridge");
        Same(reference.shipbox, L.ShipBox, "shipping box"); Same(reference.seedstand, L.SeedStand, "seed stand");
        Assert.AreEqual((reference.farmRect.x, reference.farmRect.y, reference.farmRect.w, reference.farmRect.h), (L.FarmRect.x, L.FarmRect.y, L.FarmRect.w, L.FarmRect.h), "farm");
        Assert.AreEqual((reference.cottageRect.x, reference.cottageRect.y), (L.CottageRect.x, L.CottageRect.y), "cottage");
    }

    [Test] public void TreesAndRocksMatchTheWebVersion()
    {
        var reference = Load();
        var L = HomeIslandLayout.Generate(reference.seed);
        CollectionAssert.AreEqual(reference.trees.Select(t => $"{t.x},{t.y},{t.kind}"), L.Trees.Select(t => $"{t.x},{t.y},{t.kind}"));
        CollectionAssert.AreEqual(reference.rocks.Select(t => $"{t.x},{t.y},{t.kind}"), L.Rocks.Select(t => $"{t.x},{t.y},{t.kind}"));
    }
}
