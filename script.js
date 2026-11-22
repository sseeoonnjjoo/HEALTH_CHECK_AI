
document.addEventListener("DOMContentLoaded", function () {
  const category = document.getElementById("category");
  const categoryDescription = document.getElementById("categoryDescription");
  const healthInput = document.getElementById("healthInput");
  const charCount = document.getElementById("charCount");
  const verifyButton = document.getElementById("verifyButton");

  const resultSection = document.getElementById("resultSection");
  const resultStatus = document.getElementById("resultStatus");
  const matchedClaim = document.getElementById("matchedClaim");
  const resultEvidence = document.getElementById("resultEvidence");
  const resultReason = document.getElementById("resultReason");
  const resultSources = document.getElementById("resultSources");
  const reviewPanel = document.getElementById("reviewPanel");
  const reviewOverall = document.getElementById("reviewOverall");

  const descriptions = {
    nutrition: "영양소, 비타민, 건강기능식품 등에 관한 정보를 입력해 주세요.",
    medicine: "질병의 증상, 치료법, 의약품 등에 관한 정보를 입력해 주세요.",
    lifestyle: "식습관, 운동, 수면 등 생활 건강정보를 입력해 주세요."
  };

  // ==========================================
  // 1. 분야 설명 및 글자 수
  // ==========================================

  category.addEventListener("change", function () {
    categoryDescription.textContent =
      descriptions[category.value] ||
      "검증하고 싶은 정보의 분야를 선택해 주세요.";
  });

  healthInput.addEventListener("input", function () {
    charCount.textContent =
      Array.from(healthInput.value).length + " / 2000자";
  });

  // ==========================================
  // 2. AI 분석 문장 정리
  // ==========================================

  function cleanAnalysisText(value) {
    if (typeof value !== "string") {
      return "분석 결과가 없습니다.";
    }

    return value
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/^#{1,6}\s*/gm, "")
      .trim();
  }

  // ==========================================
  // 3. 출처 표시
  // ==========================================

  function displaySources(sources) {
    resultSources.replaceChildren();

    if (!Array.isArray(sources) || sources.length === 0) {
      resultSources.textContent =
        "확인된 출처 링크가 없습니다. 추가 확인이 필요합니다.";
      return;
    }

    sources.forEach(function (source) {
      const row = document.createElement("div");
      row.className = "source-entry";

      if (source && typeof source === "object") {
        const title = document.createElement("div");

        title.textContent =
          source.name || source.title || "참고 자료";

        row.appendChild(title);

        if (typeof source.url === "string") {
          try {
            const url = new URL(source.url);

            if (
              url.protocol === "https:" ||
              url.protocol === "http:"
            ) {
              const link = document.createElement("a");

              link.href = url.href;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = "자료 원문 열기";

              row.appendChild(link);
            }
          } catch (error) {
            console.warn("잘못된 출처 URL:", source.url);
          }
        }
      } else {
        row.textContent = String(source);
      }

      resultSources.appendChild(row);
    });
  }

  // ==========================================
  // 4. 검토 기준별 확인 상태 표시
  // ==========================================

  function displayReview(review) {
    reviewPanel.replaceChildren();

    const criteria = [
      ["accuracy", "정확성"],
      ["validity", "타당성"],
      ["timeliness", "최신성"],
      ["limitations", "한계 검토"]
    ];

    const allowedStatuses = [
      "확인 완료",
      "부분 확인",
      "확인 불가",
      "추가 확인 필요"
    ];

    if (!review || typeof review !== "object") {
      reviewOverall.textContent = "추가 확인 필요";
      reviewPanel.textContent =
        "검토 기준별 결과를 확인할 수 없습니다.";
      return;
    }

    reviewOverall.textContent =
      review.overallStatus || "부분 검토 완료";

    criteria.forEach(function ([key, label]) {
      const info = review[key] || {};

      const status = allowedStatuses.includes(info.status)
        ? info.status
        : "추가 확인 필요";

      const card = document.createElement("div");
      card.className = "review-item";

      const head = document.createElement("div");
      head.className = "review-item-heading";

      const title = document.createElement("strong");
      title.textContent = label;

      const badge = document.createElement("span");
      badge.className = "review-status";

      if (status === "확인 완료") {
        badge.classList.add("completed");
      } else if (status === "확인 불가") {
        badge.classList.add("unavailable");
      } else if (status === "부분 확인") {
        badge.classList.add("partial");
      } else {
        badge.classList.add("pending");
      }

      badge.textContent = status;
      head.append(title, badge);

      const detail = document.createElement("p");
      detail.textContent =
        info.detail || "검토 근거가 등록되지 않았습니다.";

      card.append(head, detail);

      if (key === "timeliness" && info.updatedDate) {
        const date = document.createElement("p");
        date.className = "review-date";
        date.textContent =
          "확인된 자료 수정일: " + info.updatedDate;
        card.appendChild(date);
      }

      reviewPanel.appendChild(card);
    });

    const method = document.createElement("p");
    method.className = "review-method";

    method.textContent =
      "검토일: " + (review.checkedAt || "미기록") +
      " · " +
      (review.method || "공개 자료 대조 방식으로 검토했습니다.");

    reviewPanel.appendChild(method);
  }

  // ==========================================
  // 5. 판정 추출
  // ==========================================

  function extractVerdict(analysis) {
    const match = analysis.match(
      /판정\s*:\s*(근거 충분|일부 일치|근거와 불일치|판단 보류)/
    );

    return match ? match[1] : "판단 보류";
  }

  // ==========================================
  // 6. 결과 화면 표시
  // ==========================================

  function displayResult(
    status,
    claim,
    evidence,
    reason,
    sources,
    review
  ) {
    resultSection.hidden = false;

    resultStatus.textContent = status || "판단 보류";
    matchedClaim.textContent = claim || "";

    resultEvidence.textContent =
      cleanAnalysisText(evidence || "검증 근거가 없습니다.");

    resultReason.textContent = reason || "";
    resultReason.hidden = !reason;

    displaySources(sources);
    displayReview(review);

    resultSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  // ==========================================
  // 7. 건강정보 검증 실행
  // ==========================================

  verifyButton.addEventListener("click", async function () {
    const selectedCategory = category.value;
    const inputText = healthInput.value.trim();

    if (!selectedCategory) {
      alert("건강정보 분야를 선택해 주세요.");
      category.focus();
      return;
    }

    if (!inputText) {
      alert("건강정보를 입력해 주세요.");
      healthInput.focus();
      return;
    }

    if (inputText.length > 2000) {
      alert("건강정보는 2000자 이하로 입력해 주세요.");
      healthInput.focus();
      return;
    }

    verifyButton.disabled = true;
    resultSection.hidden = true;

    try {
      // 1단계: 기존 45개 자료 비교
      verifyButton.textContent = "등록 자료와 비교하는 중...";

      const verifyResponse = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          category: selectedCategory,
          text: inputText
        })
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.success) {
        throw new Error(
          verifyData.message || "기존 자료 비교에 실패했습니다."
        );
      }

      // 등록된 자료와 일치하면 기존 결과 표시
      if (verifyData.matched === true) {
        displayResult(
          verifyData.status || "판단 보류",
          verifyData.matchedClaim
            ? "비교한 등록 주장: " + verifyData.matchedClaim
            : "등록된 관련 자료를 찾았습니다.",
          verifyData.evidence || "검증 근거가 없습니다.",
          verifyData.reason || "",
          verifyData.sources || [],
          verifyData.review || null
        );

        return;
      }

      // 2단계: 일치하는 자료가 없으면 AI 분석
      verifyButton.textContent =
        "AI가 공식 자료를 검색하고 분석하는 중...";

      const aiResponse = await fetch("/api/ai-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          category: selectedCategory,
          text: inputText
        })
      });

      const aiData = await aiResponse.json();

      if (!aiResponse.ok || !aiData.success) {
        throw new Error(
          aiData.message || "AI 분석 요청에 실패했습니다."
        );
      }

      const analysis =
        aiData.analysis || "AI 분석 결과가 없습니다.";

      const verdict =
        aiData.verdict || extractVerdict(analysis);

      displayResult(
        verdict,
        "기존 45개 등록 자료와 일치하지 않아 AI 웹 검색 분석을 진행했습니다.",
        analysis,
        aiData.message ||
          "AI 분석 결과는 참고용이며 출처를 직접 확인해야 합니다.",
        aiData.sources || [],
        aiData.review || null
      );

    } catch (error) {
      console.error("건강정보 검증 오류:", error);

      alert(
        "검증 중 오류가 발생했습니다: " + error.message
      );

    } finally {
      verifyButton.disabled = false;
      verifyButton.textContent = "건강정보 검증하기";
    }
  });
});
