// The title page (web scenes/TitleScene.js): the game's name, 继续游戏 / 新的开始 (or 开始游戏 without a save),
// choosing one of three starter pets, a short intro, then the home island. The first scene of the build.
using System.Collections.Generic;
using System.Linq;
using Lingmu.Game;
using Lingmu.Rules;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using static Lingmu.UI.UiKit;

namespace Lingmu.UI
{
    public class TitleUI : MonoBehaviour
    {
        public const string GameName = "暖云";   // the owner's name for the game (2026-11-21); same as web TitleScene.js GAME_NAME
        public const string EnglishName = "Warm Cloud", Subtitle = "云朵上，有个暖暖的家";   // 【建议】
        static readonly Dictionary<string, string> Traits = new Dictionary<string, string> { { "acorn", "结实耐打，防御最高" }, { "shark", "活泼均衡，攻守兼备" }, { "fox", "机灵敏捷，攻击最高" } };

        public Canvas canvas;
        RectTransform root, page;
        string picked;
        GameState saved;

        void Start()
        {
            if (!FindAnyObjectByType<EventSystem>()) new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
            canvas = gameObject.AddComponent<Canvas>(); canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var sc = gameObject.AddComponent<CanvasScaler>(); sc.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize; sc.referenceResolution = new Vector2(1920, 1080); sc.matchWidthOrHeight = 1;
            gameObject.AddComponent<GraphicRaycaster>();
            root = Rect("title", transform).Fill();
            var sky = root.gameObject.AddComponent<Image>(); sky.color = Hex("bfe3f2");
            // the painted key visual (Resources/UI/Title, GPT art, docs/19 标题页): sky and cloud sea, slow far clouds
            var bgSprite = Art("title_bg");
            if (bgSprite)
            {
                var bg = Rect("background", root); var img = bg.gameObject.AddComponent<Image>(); img.sprite = bgSprite; img.raycastTarget = false;
                var fit = bg.gameObject.AddComponent<AspectRatioFitter>(); fit.aspectMode = AspectRatioFitter.AspectMode.EnvelopeParent; fit.aspectRatio = bgSprite.rect.width / bgSprite.rect.height;
                Cloud(root, "title_cloud_2", 0.66f, -500, 360, 9, 0.9f);
                Cloud(root, "title_cloud_1", 0.74f, 700, 300, 6, 0.85f);
            }
            else
            {
                // soft clouds and a little floating island
                foreach (var (x, y, w) in new[] { (0.12f, 0.8f, 420f), (0.85f, 0.75f, 520f), (0.5f, 0.12f, 1400f), (0.1f, 0.2f, 700f), (0.92f, 0.25f, 640f) })
                    Panel(root, "cloud", new Color(1, 1, 1, 0.75f), Circle, false).rectTransform.Place(new Vector2(x, y), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(w, w * 0.32f));
                var isle = Panel(root, "island", Hex("8bc46a"), Circle, false).rectTransform.Place(new Vector2(0.5f, 0.3f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(900, 220));
                Panel(isle, "cliff", Hex("a07850"), Circle, false).rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0.5f), new Vector2(0, -10), new Vector2(760, 150)).SetAsFirstSibling();
            }
            var st = GameSession.Store.Load(() => null);
            saved = st.source != "new" ? st.state : null;
            Show("title");
        }

        void Show(string step)
        {
            if (page) Destroy(page.gameObject);
            page = Rect(step, root).Fill();
            switch (step)
            {
                case "title": BuildTitle(); break;
                case "confirm": BuildConfirm(); break;
                case "choose": BuildChoose(); break;
                case "intro": BuildIntro(); break;
            }
        }

        static Sprite Art(string name) => Resources.Load<Sprite>("UI/Title/" + name);

        // a painted layer, centred on (x, y) of the screen
        static Image Layer(Transform parent, string name, Vector2 at, Vector2 size)
        {
            var spr = Art(name); if (!spr) return null;
            var img = Rect(name, parent).Place(at, new Vector2(0.5f, 0.5f), Vector2.zero, size).gameObject.AddComponent<Image>();
            img.sprite = spr; img.preserveAspect = true; img.raycastTarget = false;
            return img;
        }

        // a cloud drifting right and wrapping around beyond both screen edges
        static void Cloud(Transform parent, string name, float y, float x, float width, float speed, float alpha)
        {
            var img = Layer(parent, name, new Vector2(0.5f, y), new Vector2(width, width)); if (!img) return;
            img.color = new Color(1, 1, 1, alpha); img.rectTransform.anchoredPosition = new Vector2(x, 0);
            UiMotion.Drift(img, speed, 3600);
        }

        void BuildTitle()
        {
            // the floating island bobbing over the cloud sea, the airship drifting by, near clouds in front (docs/19 标题页, 带点动态)
            var isle = Layer(page, "title_island", new Vector2(0.5f, 0.38f), new Vector2(420, 420));
            if (isle) UiMotion.Bob(isle, 8, 0.32f);
            var ship = Layer(page, "title_airship", new Vector2(0.8f, 0.55f), new Vector2(290, 260));
            if (ship) UiMotion.Bob(ship, 14, 0.45f, 0.4f);
            Cloud(page, "title_cloud_3", 0.1f, -620, 640, 16, 1);
            Cloud(page, "title_cloud_4", 0.05f, 560, 720, 12, 1);

            var logo = Layer(page, "title_logo", new Vector2(0.5f, 0.81f), new Vector2(520, 330));
            if (logo) UiMotion.Bob(logo, 6, 0.42f, 0.2f);
            else
            {
                // text title until the logo art exists
                var plate = Panel(page, "plate", Cream, null, false, true).rectTransform.Place(new Vector2(0.5f, 0.78f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(620, 260));
                var t = Label(plate, GameName, 140, WoodDark, true); t.characterSpacing = 30; t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(0, 64);
                var en = Label(plate, EnglishName, FsSub, WoodMid); en.characterSpacing = 8; en.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 24), new Vector2(500, 44));
            }
            var sub = Label(page, Subtitle, FsBody, WoodDark, true); sub.characterSpacing = 24; sub.outlineWidth = 0.24f; sub.outlineColor = new Color32(251, 245, 230, 255);
            sub.rectTransform.Place(new Vector2(0.5f, 0.81f), new Vector2(0.5f, 1), new Vector2(0, -184), new Vector2(900, 56));

            // start: a honey capsule that breathes, with two sparkles beside it
            var y = 118f;
            if (saved != null)
            {
                var cont = Button(page, $"继续游戏 · 第 {saved.day} 天", Yellow, WoodDark, 38, Continue); ((RectTransform)cont.transform).Place(new Vector2(0.5f, 0), new Vector2(1, 0.5f), new Vector2(-16, y), new Vector2(460, 112));
                var fresh = Button(page, "新的开始", Cream, WoodDark, 38, () => Show("confirm")); ((RectTransform)fresh.transform).Place(new Vector2(0.5f, 0), new Vector2(0, 0.5f), new Vector2(16, y), new Vector2(320, 112));
                UiMotion.Pulse(Wrap(cont.transform), 0.025f, 0.7f);
            }
            else
            {
                var start = Button(page, "开始游戏", Yellow, WoodDark, 42, () => Show("choose")); ((RectTransform)start.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0.5f), new Vector2(0, y), new Vector2(440, 104));
                UiMotion.Pulse(Wrap(start.transform), 0.025f, 0.7f);
                foreach (var (x, ph) in new[] { (-290f, 0f), (290f, 0.5f) })
                {
                    var sp = KitImage(page, "sparkle", 54); sp.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0.5f), new Vector2(x, y + 6), new Vector2(54, 54));
                    UiMotion.Bob(sp, 8, 0.8f, ph);
                }
            }
            // the healthy gaming advice every game published in China shows on its title page
            var strip = Panel(page, "advice", new Color(1, 0.96f, 0.89f, 0.85f), FlatRound, false).rectTransform; strip.anchorMin = Vector2.zero; strip.anchorMax = new Vector2(1, 0); strip.pivot = new Vector2(0.5f, 0); strip.offsetMin = new Vector2(0, -20); strip.offsetMax = new Vector2(0, 50);
            var tip = Label(page, "抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。", FsMin, WoodDark);
            tip.outlineWidth = 0; tip.textWrappingMode = TextWrappingModes.NoWrap;
            tip.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 7), new Vector2(1800, 40));
        }

        // puts a button inside a holder of the same place and size, so a breathing motion and the press feedback don't fight
        static RectTransform Wrap(Transform button)
        {
            var b = (RectTransform)button;
            var holder = Rect(b.name + " holder", b.parent);
            holder.anchorMin = b.anchorMin; holder.anchorMax = b.anchorMax; holder.pivot = b.pivot; holder.anchoredPosition = b.anchoredPosition; holder.sizeDelta = b.sizeDelta;
            holder.SetSiblingIndex(b.GetSiblingIndex());
            b.SetParent(holder, false); b.Fill();
            return holder;
        }

        void BuildConfirm()
        {
            var c = Panel(page, "confirm", Cream, null, true, true).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(900, 440));
            var t = Label(c, $"现在的存档（第 {saved?.day} 天）会被清除，\n确定要重新开始吗？", 38, Ink); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(40, 160);
            var no = Button(c, "取消", Yellow, WoodDark, 36, () => Show("title")); ((RectTransform)no.transform).Place(new Vector2(0.5f, 0), new Vector2(1, 0), new Vector2(-16, 50), new Vector2(260, 96));
            var yes = Button(c, "重新开始", CreamDark, WoodDark, 36, () => Show("choose")); ((RectTransform)yes.transform).Place(new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(16, 50), new Vector2(260, 96));
        }

        void BuildChoose()
        {
            var head = Label(page, "选一只宠物，陪你一起出发", 54, WoodDark, true); head.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -50), new Vector2(1400, 90));
            head.outlineWidth = 0.15f; head.outlineColor = new Color32(251, 243, 220, 255);
            var back = Kit("btn_back") ? Button(page, "", Color.white, WoodDark, 32, () => Show("title"), Kit("btn_back")) : Button(page, "返回", WoodMid, Cream, 32, () => Show("title"), Circle); ((RectTransform)back.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(40, -40), new Vector2(120, 120));
            var starters = GameData.Starters;
            for (int i = 0; i < starters.Count; i++)
            {
                var id = starters[i]; var sp = GameData.Species(id);
                bool on = picked == id;
                var card = Panel(page, "card " + id, on ? Yellow : Cream, null, true, true);
                card.rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2((i - 1) * 520, 30), new Vector2(480, 640));
                card.gameObject.AddComponent<Button>().onClick.AddListener(() => { picked = id; Show("choose"); });
                var img = Rect("art", card.transform).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, on ? -4 : -20), new Vector2(300, 300)).gameObject.AddComponent<Image>();
                img.sprite = Resources.Load<Sprite>("Icons/Pets/pet_" + id); img.preserveAspect = true; img.raycastTarget = false;
                var n = Label(card.transform, sp.name, 48, WoodDark, true); n.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -320), new Vector2(440, 64));
                var chip = Panel(card.transform, "element", ElementColor(sp.element), RoundSmall, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -392), new Vector2(120, 46));
                var ct = Label(chip, sp.element + "属性", FsMin, Readable(ElementColor(sp.element), Color.white), true); ct.rectTransform.Fill();
                var strong = GameData.Elements.Where(e => Elements.Multiplier(sp.element, e) > 1).ToList();
                var weak = GameData.Elements.Where(e => Elements.Multiplier(e, sp.element) > 1).ToList();
                string info = $"{Traits.GetValueOrDefault(id, "")}\n克制：{string.Join("、", strong)}　怕：{string.Join("、", weak)}\n探索：{Explore.SkillNames.GetValueOrDefault(sp.explore, sp.explore)}　打工：{PetCare.Work.GetValueOrDefault(sp.work)?.name}";
                var t = Label(card.transform, info, 28, Ink); t.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 30), new Vector2(440, 170));
            }
            var go = Button(page, "就选它", picked != null ? Yellow : CreamDark, WoodDark, 40, () => { if (picked != null) Show("intro"); });
            go.interactable = picked != null;
            ((RectTransform)go.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 40), new Vector2(380, 104));
        }

        void BuildIntro()
        {
            var sp = GameData.Species(picked);
            var c = Panel(page, "intro", Cream, null, true, true).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1240, 640));
            var img = Rect("art", c).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(40, 30), new Vector2(380, 380)).gameObject.AddComponent<Image>();
            img.sprite = Resources.Load<Sprite>("Icons/Pets/pet_" + picked); img.preserveAspect = true; img.raycastTarget = false;
            var h = Label(c, $"{sp.name}成为了你的伙伴！", 46, WoodDark, true, TextAlignmentOptions.Left); h.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(450, -60), new Vector2(760, 70));
            var t = Label(c, "飞艇把你们送到了云海上的一座小浮岛。\n从今天起，这里就是你们的家。\n\n坐飞艇去远方的岛屿探险，\n天黑前记得回家。", 34, Ink, false, TextAlignmentOptions.TopLeft);
            t.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(450, -150), new Vector2(760, 320));
            var go = Button(c, "开始冒险", Yellow, WoodDark, 40, StartNew); ((RectTransform)go.transform).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(450, 50), new Vector2(380, 104));
        }

        void StartNew()
        {
            GameSession.Store.Wipe();
            var s = SaveRules.NewGameState(starter: picked);
            GameSession.UseState(s);
            GameSession.Store.Save(s);
            SceneManager.LoadScene(GameSession.Scenes["home"]);
        }

        void Continue()
        {
            GameSession.UseState(saved);
            var area = saved.player.area;
            SceneManager.LoadScene(GameSession.Scenes.TryGetValue(area, out var scene) ? scene : GameSession.Scenes["home"]);
        }
    }
}
