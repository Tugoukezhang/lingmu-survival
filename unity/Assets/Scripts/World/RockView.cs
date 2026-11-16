// A rock (or crystal) placed in the editor, built when the scene starts (see StoneKit).
using UnityEngine;

namespace Lingmu.World
{
    public class RockView : MonoBehaviour
    {
        public int seed;
        public float size = 0.9f;
        public bool crystal, rare;
        void Start()
        {
            var g = crystal ? StoneKit.Crystal(transform, transform.position, seed, rare) : StoneKit.Rock(transform, transform.position, seed, size);
            g.transform.localPosition = Vector3.zero;
        }
    }
}
