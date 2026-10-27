/**
 * Termes techniques reconnus dans les annonces, pour repérer ce qu'une offre
 * demande (et donc ce qui manque au profil). Liste volontairement ciblée :
 * langages, frameworks, cloud, data/ML, embarqué, méthodes. Chaque entrée :
 * libellé affiché, puis variantes cherchées dans le texte. Sans dépendance serveur.
 */
export const TECH_TERMS: [label: string, ...variants: string[]][] = [
  // Langages
  ["Python"], ["Java"], ["JavaScript", "JS"], ["TypeScript"], ["C++", "C++11", "C++14", "C++17", "C++20"], ["C#", "C sharp"], ["C/C++"],
  ["Golang"], ["Rust"], ["Scala"], ["Kotlin"], ["Swift"], ["MATLAB"], ["Simulink"], ["Bash", "shell"], ["SQL"], ["PHP"], ["Ruby"],
  ["VHDL"], ["Verilog"], ["Assembleur", "assembly"], ["Julia"], ["HCL"],
  // Web, back-end
  ["React", "React.js", "ReactJS"], ["Angular"], ["Vue", "Vue.js"], ["Next.js"], ["Node.js", "NodeJS"], ["Django"], ["Flask"], ["FastAPI"],
  ["Spring", "Spring Boot"], [".NET", "dotnet"], ["GraphQL"], ["REST", "API REST", "RESTful"], ["gRPC"], ["microservices", "micro-services"],
  ["Kafka"], ["RabbitMQ"], ["Redis"], ["Elasticsearch"],
  // Données
  ["PostgreSQL", "Postgres"], ["MySQL"], ["MongoDB"], ["Snowflake"], ["BigQuery"], ["Databricks"], ["Spark", "PySpark", "Apache Spark"],
  ["Airflow"], ["dbt"], ["ETL"], ["Hadoop"], ["pandas"], ["NumPy"], ["Power BI", "PowerBI"], ["Excel"], ["data pipelines", "pipelines de données"],
  // ML / IA
  ["machine learning", "apprentissage automatique"], ["deep learning", "apprentissage profond"], ["PyTorch"], ["TensorFlow"], ["Keras"],
  ["scikit-learn", "sklearn"], ["XGBoost"], ["LightGBM"], ["LLM", "LLMs", "large language models"], ["IA générative", "generative AI", "GenAI"],
  ["RAG", "retrieval augmented generation"], ["LangChain"], ["LlamaIndex"], ["Hugging Face", "HuggingFace", "transformers"], ["NLP", "TALN"],
  ["computer vision", "vision par ordinateur"], ["OpenCV"], ["MLOps"], ["MLflow"], ["Kubeflow"], ["vector database", "base vectorielle", "pgvector"],
  ["embeddings"], ["prompt engineering"], ["fine-tuning", "fine tuning"], ["agents IA", "AI agents", "agentic", "agentique"], ["OpenAI"],
  ["Azure OpenAI"], ["Anthropic", "Claude"], ["Mistral"], ["reinforcement learning", "apprentissage par renforcement"], ["time series", "séries temporelles"],
  ["statistics", "statistiques"],
  // Cloud, DevOps
  ["AWS", "Amazon Web Services"], ["Azure"], ["GCP", "Google Cloud"], ["Docker"], ["Kubernetes", "K8s"], ["Terraform"], ["Ansible"], ["Helm"],
  ["CI/CD"], ["GitHub Actions"], ["GitLab CI"], ["Jenkins"], ["Git"], ["Linux"], ["DevOps"], ["SRE"], ["Prometheus"], ["Grafana"], ["IaC", "infrastructure as code"],
  ["serverless"], ["OpenShift"],
  // Embarqué, automobile, industrie
  ["embarqué", "embedded"], ["Linux embarqué", "embedded Linux"], ["Yocto"], ["Buildroot"], ["RTOS", "FreeRTOS", "Zephyr"], ["firmware"],
  ["microcontrôleur", "microcontroller", "MCU"], ["STM32"], ["ESP32"], ["ARM"], ["FPGA"], ["CAN", "CAN bus", "bus CAN"], ["LIN"], ["Ethernet automobile", "automotive Ethernet"],
  ["AUTOSAR"], ["ISO 26262"], ["ASPICE", "Automotive SPICE"], ["MISRA"], ["drivers"], ["BSP"], ["I2C"], ["SPI"], ["UART"],
  ["bancs d'essais", "banc d'essai", "test bench"], ["HIL", "hardware-in-the-loop"], ["CANoe"], ["dSPACE"], ["LabVIEW"], ["ROS", "ROS2"],
  // Qualité, méthodes, sécurité
  ["tests unitaires", "unit tests", "unit testing"], ["test automation", "automatisation des tests"], ["pytest"], ["Selenium"], ["Cypress"],
  ["tests de non-régression", "regression testing"], ["TDD"], ["Agile", "agilité"], ["Scrum"], ["Kanban"], ["Jira"], ["Confluence"],
  ["cybersécurité", "cybersecurity", "sécurité informatique"], ["OAuth2", "OAuth"], ["JWT"], ["pentest", "tests d'intrusion"],
];

/**
 * Termes qui sont aussi des mots courants (« can », « rest », « vue », « arm ») :
 * cherchés en respectant la casse, tels qu'écrits dans les annonces techniques.
 */
export const CASE_SENSITIVE = new Set(["CAN", "REST", "Vue", "ARM", "LIN", "SPI", "HIL", "BSP", "ROS", "RAG", "LLM", "JS", "TDD", "SRE", "MCU", "I2C", "UART", "IaC", "TALN"]);

/** Libellé canonique → variantes (libellé inclus). */
export function termVariants(entry: [string, ...string[]]): string[] {
  const [label, ...rest] = entry;
  return [label, ...rest];
}
