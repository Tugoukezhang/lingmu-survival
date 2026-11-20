// A town resident: plays its idle clip from its own point in the loop (so neighbours don't breathe in step) and turns
// to face the player who comes close, turning back to its usual direction when they leave.
using UnityEngine;

namespace Lingmu.Game
{
    public class NpcIdle : MonoBehaviour
    {
        public float notice = 3.5f;          // metres
        Quaternion home;
        void Start()
        {
            home = transform.rotation;
            var anim = GetComponentInChildren<Animator>();
            if (anim && anim.runtimeAnimatorController) anim.Play(0, 0, Mathf.Repeat(transform.position.x * 0.37f + transform.position.z * 0.11f, 1f));
        }

        void Update()
        {
            var s = GameSession.I;
            var want = home;
            if (s && s.player)
            {
                var d = s.player.position - transform.position; d.y = 0;
                if (d.magnitude < notice && d.sqrMagnitude > 0.01f) want = Quaternion.LookRotation(d) * Quaternion.Inverse(Quaternion.LookRotation(home * Vector3.forward)) * home;
            }
            transform.rotation = Quaternion.Slerp(transform.rotation, want, 1 - Mathf.Exp(-Time.deltaTime * 4));
        }
    }
}
