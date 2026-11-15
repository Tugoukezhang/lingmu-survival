// Deterministic random numbers, ported 1:1 from the web version (game/src/systems/rng.js):
// the same seed gives exactly the same sequence, so islands generated from a seed look the same in both versions.
using System;

namespace Lingmu.Core
{
    public sealed class Mulberry32
    {
        uint a;
        public Mulberry32(long seed) { a = unchecked((uint)seed); }

        // 0 <= value < 1
        public double Next()
        {
            unchecked
            {
                a += 0x6d2b79f5;
                uint t = a;
                t = (uint)((int)(t ^ (t >> 15)) * (int)(t | 1));
                t ^= t + (uint)((int)(t ^ (t >> 7)) * (int)(t | 61));
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }
    }

    // Smooth 2D value noise in 0..1 on a seeded 64 x 64 lattice (rng.js valueNoise2D).
    public sealed class ValueNoise2D
    {
        const int Size = 64;
        readonly double[] lattice = new double[Size * Size];
        readonly double scale;

        public ValueNoise2D(long seed, double scale)
        {
            this.scale = scale;
            var r = new Mulberry32(seed);
            for (int i = 0; i < lattice.Length; i++) lattice[i] = r.Next();
        }

        double At(long x, long y) => lattice[(int)(((y % Size + Size) % Size) * Size + ((x % Size + Size) % Size))];
        static double Smooth(double t) => t * t * (3 - 2 * t);

        public double Sample(double x, double y)
        {
            double fx = x / scale, fy = y / scale;
            long x0 = (long)Math.Floor(fx), y0 = (long)Math.Floor(fy);
            double tx = Smooth(fx - x0), ty = Smooth(fy - y0);
            double a = At(x0, y0) + (At(x0 + 1, y0) - At(x0, y0)) * tx;
            double b = At(x0, y0 + 1) + (At(x0 + 1, y0 + 1) - At(x0, y0 + 1)) * tx;
            return a + (b - a) * ty;
        }
    }
}
