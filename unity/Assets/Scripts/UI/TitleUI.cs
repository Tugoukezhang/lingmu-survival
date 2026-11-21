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
            // soft clouds and a little floating island
            foreach (var (x, y, w) in new[] { (0.12f, 0.8f, 420f), (0.85f, 0.75f, 520f), (0.5f, 0.12f, 1400f), (0.1f, 0.2f, 700f), (0.92f, 0.25f, 640f) })
                Panel(root, "cloud", new Color(1, 1, 1, 0.75f), Circle, false).rectTransform.Place(new Vector2(x, y), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(w, w * 0.32f));
            var isle = Panel(root, "island", Hex("8bc46a"), Circle, false).rectTransform.Place(new Vector2(0.5f, 0.3f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(900, 220));
            Panel(isle, "cliff", Hex("a07850"), Circle, false).rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0.5f), new Vector2(0, -10), new Vector2(760, 150)).SetAsFirstSibling();
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

        void BuildTitle()
        {
            // placeholder title plate until the logo art is made (docs/19)
            var plate = Panel(page, "plate", Cream, null, false, true).rectTransform.Place(new Vector2(0.5f, 0.72f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(620, 260));
            var t = Label(plate, GameName, 140, WoodDark, true); t.characterSpacing = 30; t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(0, 64);
            var en = Label(plate, EnglishName, FsSub, WoodMid); en.characterSpacing = 8; en.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 24), new Vector2(500, 44));
            var sub = Label(page, Subtitle, FsBody, WoodDark, true); sub.characterSpacing = 20; sub.outlineWidth = 0.2f; sub.outlineColor = new Color32(251, 243, 220, 255);
            sub.rectTransform.Place(new Vector2(0.5f, 0.72f), new Vector2(0.5f, 1), new Vector2(0, -140), new Vector2(900, 56));
            foreach (var (sp, x) in new[] { ("acorn", -330f), ("fox", 0f), ("shark", 330f) })
            {
                var img = Rect("pet", page).Place(new Vector2(0.5f, 0.32f), new Vector2(0.5f, 0), new Vector2(x, -40), new Vector2(260, 260)).gameObject.AddComponent<Image>();
                img.sprite = Resources.Load<Sprite>("Icons/Pets/pet_" + sp); img.preserveAspect = true; img.raycastTarget = false;
            }
            if (saved != null)
            {
                var cont = Button(page, $"继续游戏 · 第 {saved.day} 天", Yellow, WoodDark, 38, Continue); ((RectTransform)cont.transform).Place(new Vector2(0.5f, 0), new Vector2(1, 0), new Vector2(-16, 80), new Vector2(460, 110));
                var fresh = Button(page, "新的开始", CreamDark, WoodDark, 38, () => Show("confirm")); ((RectTransform)fresh.transform).Place(new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(16, 80), new Vector2(320, 110));
            }
            else { var start = Button(page, "开始游戏", Yellow, WoodDark, 42, () => Show("choose")); ((RectTransform)start.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 80), new Vector2(420, 116)); }
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
            var back = Button(page, "返回", WoodMid, Cream, 32, () => Show("title"), Circle); ((RectTransform)back.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(40, -40), new Vector2(120, 120));
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
                var chip = Panel(card.transform, "element", WildPet.ElementColor(sp.element), RoundSmall, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -392), new Vector2(120, 46));
                var ct = Label(chip, sp.element + "属性", FsMin, Color.white, true); ct.rectTransform.Fill();
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
